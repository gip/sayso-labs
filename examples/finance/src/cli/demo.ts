#!/usr/bin/env node
import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Command } from "commander";
import { addCommonOptions, getCommonOptions } from "./options.js";
import { connectToOracle, fetchSpotPrices, fetchSupportedMarkets } from "../demo/client.js";
import { createQuickJsDemoApplication } from "../demo/quickjs.js";
import type { SaySoConversation } from "../sayso/xmtp.js";
import { createXmtpClient } from "../sayso/xmtp.js";
import type { ConnectionResponsePayload } from "../sayso/types.js";

const parsePositiveInteger = (value: string, name: string) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
};

const program = new Command();
program
  .name("sayso-demo")
  .description("Interactive CLI demo client for sayso-oracle.")
  .argument("<sayso-oracle>", "sayso-oracle wallet address or XMTP inbox ID")
  .option("--request-timeout-ms <ms>", "Oracle request timeout in milliseconds.", "30000")
  .showHelpAfterError();

addCommonOptions(program);

program.action(async (oracle: string) => {
  const options = {
    ...getCommonOptions(program),
    ...program.opts<{
      requestTimeoutMs: string;
    }>(),
  };
  const timeoutMs = parsePositiveInteger(options.requestTimeoutMs, "--request-timeout-ms");
  const { client, walletAddress } = await createXmtpClient("sayso-demo", options);
  let conversation: SaySoConversation | null = null;
  let connection: ConnectionResponsePayload | null = null;
  const rl = readline.createInterface({ input, output });
  const localText = {
    write: ({ message, channel }: { message: string; channel?: string }) => {
      if (channel === "stderr") console.error(message);
      else console.log(message);
    },
    read: async ({
      prompt,
      multiline,
      secret,
      timeoutMs: localTimeoutMs,
    }: {
      prompt?: string;
      multiline?: boolean;
      secret?: boolean;
      timeoutMs?: number;
    }) => {
      if (multiline) {
        return { status: "unavailable" as const, message: "Multiline local text input is not supported by sayso-demo." };
      }
      if (secret) {
        return { status: "unavailable" as const, message: "Secret local text input is not supported by sayso-demo." };
      }
      const controller = localTimeoutMs === undefined ? undefined : new AbortController();
      const timeout =
        localTimeoutMs === undefined || !controller
          ? undefined
          : setTimeout(() => controller.abort(), localTimeoutMs);
      try {
        const value = controller
          ? await rl.question(prompt ?? "", { signal: controller.signal })
          : await rl.question(prompt ?? "");
        return { status: "ok" as const, value };
      } catch (error) {
        if (controller?.signal.aborted) {
          return { status: "timeout" as const, message: "Local text input timed out." };
        }
        return {
          status: "cancelled" as const,
          message: error instanceof Error ? error.message : String(error),
        };
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    },
  };

  const demoApp = await createQuickJsDemoApplication({
    params: {
      walletAddress,
      inboxId: client.inboxId,
      env: options.env,
      oracle,
    },
    localText,
    host: {
      connect: async () => {
        await client.conversations.syncAll();
        const result = await connectToOracle({
          client,
          oracle,
          timeoutMs,
        });
        conversation = result.conversation;
        connection = result.connection;
        return result.connection;
      },
      supportedMarkets: async () => {
        if (!conversation || !connection) throw new Error("sayso-demo is not connected to the oracle.");
        return fetchSupportedMarkets({
          conversation,
          ownInboxId: client.inboxId,
          timeoutMs,
        });
      },
      spotPrices: async ({ markets }) => {
        if (!conversation || !connection) throw new Error("sayso-demo is not connected to the oracle.");
        return fetchSpotPrices({
          conversation,
          ownInboxId: client.inboxId,
          markets,
          timeoutMs,
        });
      },
    },
  });

  try {
    await demoApp.run();
  } finally {
    demoApp.dispose();
    rl.close();
  }
});

await program.parseAsync();
