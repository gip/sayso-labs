import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  IdentifierKind,
  type DecodedMessage,
  type Identifier,
} from "@xmtp/node-sdk";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createPgPool } from "@sayso-labs/db-postgres";
import {
  CONTENT_TYPES,
  contentTypeKey,
  type AgentQueryResponsePayload,
  type ConnectionResponsePayload,
  type SaySoCodecContent,
} from "@sayso-labs/protocol";
import { createXmtpClient, sendTyped, type SaySoClient } from "../xmtp/client.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(currentDir, "../..");
const networkRoot = resolve(backendRoot, "../..");
const examplesCliRoot = join(networkRoot, "apps/cli");
const migrationPath = join(networkRoot, "packages/db-postgres/migrations/001_init.sql");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

type ManagedProcess = {
  output: () => string;
  stop: () => Promise<void>;
  waitFor: (
    pattern: RegExp,
    label: string,
    timeoutMs?: number,
  ) => Promise<RegExpMatchArray>;
  waitForExit: (timeoutMs?: number) => Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    output: string;
  }>;
};

const hexKey = () => `0x${randomBytes(32).toString("hex")}`;

const randomPort = () => 20_000 + Math.floor(Math.random() * 30_000);

const quoteIdent = (identifier: string) =>
  `"${identifier.replaceAll('"', '""')}"`;

const schemaScopedUrl = (connectionString: string, schema: string) => {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(
      "DATABASE_URL must be a URL-style Postgres connection string for functional tests.",
    );
  }
  url.searchParams.set("sayso_schema", schema);
  return url.toString();
};

const createFunctionalSchema = async (databaseUrl: string) => {
  const schema = `sayso_func_${randomUUID().replaceAll("-", "_")}`;
  const adminPool = createPgPool(databaseUrl);
  const schemaPool = createPgPool(schemaScopedUrl(databaseUrl, schema));
  try {
    await adminPool.query(`CREATE SCHEMA ${quoteIdent(schema)}`);
    await schemaPool.query(await readFile(migrationPath, "utf8"));
  } catch (error) {
    await schemaPool.end().catch(() => undefined);
    await adminPool
      .query(`DROP SCHEMA IF EXISTS ${quoteIdent(schema)} CASCADE`)
      .catch(() => undefined);
    await adminPool.end().catch(() => undefined);
    throw error;
  }
  return {
    schema,
    url: schemaScopedUrl(databaseUrl, schema),
    cleanup: async () => {
      await schemaPool.end().catch(() => undefined);
      await adminPool
        .query(`DROP SCHEMA IF EXISTS ${quoteIdent(schema)} CASCADE`)
        .catch(() => undefined);
      await adminPool.end().catch(() => undefined);
    },
  };
};

const startManagedProcess = (
  label: string,
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): ManagedProcess => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  let output = "";
  let exitState:
    | { code: number | null; signal: NodeJS.Signals | null }
    | undefined;
  const waiters = new Set<{
    pattern: RegExp;
    label: string;
    resolve: (match: RegExpMatchArray) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();

  const append = (chunk: Buffer) => {
    output += chunk.toString("utf8");
    for (const waiter of [...waiters]) {
      const match = output.match(waiter.pattern);
      if (!match) continue;
      clearTimeout(waiter.timeout);
      waiters.delete(waiter);
      waiter.resolve(match);
    }
  };

  child.stdout.on("data", append);
  child.stderr.on("data", append);
  child.on("error", (error) => {
    for (const waiter of [...waiters]) {
      clearTimeout(waiter.timeout);
      waiter.reject(
        new Error(`${label} failed to start: ${error.message}\n${output}`),
      );
    }
    waiters.clear();
  });
  child.on("exit", (code, signal) => {
    exitState = { code, signal };
    for (const waiter of [...waiters]) {
      clearTimeout(waiter.timeout);
      waiter.reject(
        new Error(
          `${label} exited before ${waiter.label}; code=${code} signal=${signal}\n${output}`,
        ),
      );
    }
    waiters.clear();
  });

  const stop = async () => {
    if (exitState) return;
    const exited = new Promise<void>((resolveExit) =>
      child.once("exit", () => resolveExit()),
    );
    try {
      if (process.platform === "win32") child.kill("SIGTERM");
      else if (child.pid !== undefined) process.kill(-child.pid, "SIGTERM");
      else child.kill("SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
    const stopped = await Promise.race([
      exited.then(() => true),
      new Promise<false>((resolveTimeout) =>
        setTimeout(() => resolveTimeout(false), 5_000),
      ),
    ]);
    if (stopped) return;
    try {
      if (process.platform === "win32") child.kill("SIGKILL");
      else if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
      else child.kill("SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
    await Promise.race([
      exited,
      new Promise<void>((resolveTimeout) => setTimeout(resolveTimeout, 2_000)),
    ]);
  };

  return {
    output: () => output,
    stop,
    waitFor: (pattern, targetLabel, timeoutMs = 60_000) => {
      const existing = output.match(pattern);
      if (existing) return Promise.resolve(existing);
      if (exitState) {
        return Promise.reject(
          new Error(
            `${label} already exited before ${targetLabel}; code=${exitState.code} signal=${exitState.signal}\n${output}`,
          ),
        );
      }
      return new Promise((resolveWait, rejectWait) => {
        const waiter = {
          pattern,
          label: targetLabel,
          resolve: resolveWait,
          reject: rejectWait,
          timeout: setTimeout(() => {
            waiters.delete(waiter);
            rejectWait(
              new Error(
                `Timed out waiting for ${label} to emit ${targetLabel}.\n${output}`,
              ),
            );
          }, timeoutMs),
        };
        waiters.add(waiter);
      });
    },
    waitForExit: (timeoutMs = 60_000) => {
      if (exitState) return Promise.resolve({ ...exitState, output });
      return new Promise((resolveExit, rejectExit) => {
        const timeout = setTimeout(() => {
          rejectExit(
            new Error(`Timed out waiting for ${label} to exit.\n${output}`),
          );
        }, timeoutMs);
        child.once("exit", (code, signal) => {
          clearTimeout(timeout);
          resolveExit({ code, signal, output });
        });
      });
    },
  };
};

const withTimeout = async <T>(
  promise: Promise<T>,
  label: string,
  timeoutMs: number,
): Promise<T> => {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Timed out waiting for ${label}.`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const getOrCreateDmByWallet = async (
  client: SaySoClient,
  walletAddress: string,
) => {
  const identifier: Identifier = {
    identifier: walletAddress.toLowerCase(),
    identifierKind: IdentifierKind.Ethereum,
  };
  const existing = await client.conversations.fetchDmByIdentifier(identifier);
  return (
    existing ?? (await client.conversations.createDmWithIdentifier(identifier))
  );
};

const waitForMessage = async (
  conversation: Awaited<ReturnType<typeof getOrCreateDmByWallet>>,
  ownInboxId: string,
  expectedKey: ReturnType<typeof contentTypeKey>,
  timeoutMs: number,
) => {
  const stream = await conversation.stream();
  try {
    return await withTimeout(
      (async () => {
        for await (const message of stream) {
          const typedMessage = message as DecodedMessage<SaySoCodecContent>;
          if (typedMessage.senderInboxId === ownInboxId) continue;
          if (contentTypeKey(typedMessage.contentType) === expectedKey)
            return typedMessage;
        }
        throw new Error(`XMTP stream ended before receiving ${expectedKey}.`);
      })(),
      `XMTP ${expectedKey}`,
      timeoutMs,
    );
  } finally {
    await stream.end();
  }
};

const sendAndWait = async (
  conversation: Awaited<ReturnType<typeof getOrCreateDmByWallet>>,
  ownInboxId: string,
  content: SaySoCodecContent,
  contentType: (typeof CONTENT_TYPES)[keyof typeof CONTENT_TYPES],
  expectedKey: ReturnType<typeof contentTypeKey>,
  timeoutMs: number,
) => {
  const pending = waitForMessage(
    conversation,
    ownInboxId,
    expectedKey,
    timeoutMs,
  );
  await sendTyped(conversation, content, contentType);
  return pending;
};

const closeXmtpClient = async (client?: SaySoClient) => {
  await (
    client as (SaySoClient & { close?: () => Promise<void> }) | undefined
  )?.close?.();
};

describe("functional XMTP agents", () => {
  it(
    "registers pong with SaySo Network, discovers it, and pings the discovered agent",
    { timeout: 240_000 },
    async () => {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl)
        throw new Error(
          "DATABASE_URL is required for functional XMTP agent tests.",
        );

      const children: ManagedProcess[] = [];
      const tempRoot = await mkdtemp(join(tmpdir(), "sayso-functional-"));
      let schema:
        | Awaited<ReturnType<typeof createFunctionalSchema>>
        | undefined;
      let queryClient: SaySoClient | undefined;

      try {
        schema = await createFunctionalSchema(databaseUrl);
        const networkPrivateKey = generatePrivateKey();
        const networkWallet =
          privateKeyToAccount(networkPrivateKey).address.toLowerCase();
        const pongPrivateKey = generatePrivateKey();
        const pongWallet =
          privateKeyToAccount(pongPrivateKey).address.toLowerCase();
        const queryPrivateKey = generatePrivateKey();
        const pingPrivateKey = generatePrivateKey();

        const backend = startManagedProcess(
          "sayso-network backend",
          pnpm,
          ["--dir", backendRoot, "exec", "tsx", "src/index.ts"],
          {
            cwd: backendRoot,
            env: {
              DEV_DATABASE_URL: schema.url,
              HTTP_HOST: "127.0.0.1",
              HTTP_PORT: String(randomPort()),
              START_XMTP: "true",
              WORLD_ID_VERIFY_ENABLED: "false",
              XMTP_PRIVATE_KEY: networkPrivateKey,
              XMTP_DB_ENCRYPTION_KEY: hexKey(),
              SAYSO_SKIP_ENV_FILES: "true",
            },
          },
        );
        children.push(backend);
        const networkInbox = (
          await backend.waitFor(/Inbox ID: ([^\s]+)/, "network inbox", 90_000)
        )[1];
        expect(backend.output()).toContain(
          "SaySo Network registry agent running",
        );
        expect(backend.output()).toContain(`Wallet: ${networkWallet}`);

        const pong = startManagedProcess(
          "sayso-pong-agent",
          pnpm,
          [
            "--dir",
            examplesCliRoot,
            "exec",
            "tsx",
            "src/cli/pong-agent.ts",
            "--private-key",
            pongPrivateKey,
            "--env",
            "dev",
            "--db-dir",
            join(tempRoot, "pong-xmtp"),
            "--network-agent",
            networkWallet,
            "--network-registration-timeout-ms",
            "90000",
          ],
          {
            cwd: examplesCliRoot,
            env: {
              XMTP_DB_ENCRYPTION_KEY: hexKey(),
              SAYSO_NETWORK_AGENT: networkWallet,
            },
          },
        );
        children.push(pong);
        const pongInbox = (
          await pong.waitFor(/Inbox ID: ([^\s]+)/, "pong inbox", 90_000)
        )[1];
        await pong.waitFor(
          /SaySo Network registration accepted:/,
          "accepted network registration",
          120_000,
        );
        expect(pong.output()).toContain(`Wallet: ${pongWallet}`);

        const created = await createXmtpClient({
          privateKey: queryPrivateKey,
          dbEncryptionKey: hexKey(),
          env: "dev",
          dbDir: join(tempRoot, "query-xmtp"),
        });
        queryClient = created.client;
        const networkConversation = await getOrCreateDmByWallet(
          queryClient,
          networkWallet,
        );

        const connectionMessage = await sendAndWait(
          networkConversation,
          queryClient.inboxId,
          {},
          CONTENT_TYPES.connectionRequest,
          "connectionResponse",
          90_000,
        );
        const connection =
          connectionMessage.content as ConnectionResponsePayload;
        expect(connection.status).toBe("ok");
        if (connection.status === "ok")
          expect(connection.agent.syncInboxId).toBe(networkInbox);

        const queryRequestId = `functional_query_${randomUUID()}`;
        const queryMessage = await sendAndWait(
          networkConversation,
          queryClient.inboxId,
          {
            requestId: queryRequestId,
            skillIds: ["sayso.demo.pong"],
            capabilityIds: ["pong.respond"],
            limit: 10,
          },
          CONTENT_TYPES.agentQuery,
          "agentQueryResponse",
          90_000,
        );
        const queryResponse = queryMessage.content as AgentQueryResponsePayload;
        expect(queryResponse.requestId).toBe(queryRequestId);
        expect(queryResponse.results).toHaveLength(1);
        const [record] = queryResponse.results;
        expect(record.walletAddress).toBe(pongWallet);
        expect(record.agent.syncInboxId).toBe(pongInbox);
        expect(record.skillDisclosure).toBe("include-skill-packet");
        expect(
          record.skillPacket?.skills.map((skill) => skill.skillId),
        ).toContain("sayso.demo.pong");
        expect(
          record.skillPacket?.skill.capabilities.map(
            (capability) => capability.capabilityId,
          ),
        ).toContain("pong.respond");

        const agentTest = startManagedProcess(
          "sayso-agent-test",
          pnpm,
          [
            "--dir",
            examplesCliRoot,
            "exec",
            "tsx",
            "src/cli/agent-test.ts",
            "--private-key",
            pingPrivateKey,
            "--env",
            "dev",
            "--db-dir",
            join(tempRoot, "ping-xmtp"),
            "--agent",
            record.agent.syncInboxId,
            "--timeout-ms",
            "90000",
            "--ping",
          ],
          {
            cwd: examplesCliRoot,
            env: {
              XMTP_DB_ENCRYPTION_KEY: hexKey(),
            },
          },
        );
        children.push(agentTest);
        const agentTestResult = await agentTest.waitForExit(120_000);
        expect(agentTestResult.code).toBe(0);
        expect(agentTestResult.output).toContain("Pong response:");
        expect(agentTestResult.output).toContain("message: 'pong'");
      } finally {
        await closeXmtpClient(queryClient).catch(() => undefined);
        await Promise.all(children.reverse().map((child) => child.stop()));
        await schema?.cleanup();
        await rm(tempRoot, { recursive: true, force: true });
      }
    },
  );
});
