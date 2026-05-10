#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import type { DecodedMessage, Dm, Signer } from "@xmtp/node-sdk";
import type { ContentTypeId } from "@xmtp/content-type-primitives";
import { addCommonOptions, getCommonOptions } from "./options.js";
import { CONTENT_TYPES, contentTypeKey, contentTypeName, contentTypeNameFromKey } from "../sayso/contentTypes.js";
import { PRE_CONNECTION_EXPLANATION } from "../sayso/constants.js";
import {
  createAgentInfo,
  createConnectionError,
  createError,
} from "../sayso/protocol.js";
import { describeSenderIdentity, type SenderIdentity } from "../sayso/identity.js";
import {
  isConnectionRequest,
  isRecord,
  parseSkillRequest,
} from "../sayso/validation.js";
import { createXmtpClient, sendTyped, type SaySoClient, type SaySoSendConversation } from "../sayso/xmtp.js";
import type { PongRuntimeConfiguration } from "../pong/configuration.js";
import type { PongSourceSnapshotStore } from "../pong/source.js";
import { createNativePongApplication, type PongApplication, type PongApplicationReply } from "../pong/application.js";
import { createQuickJsPongApplication } from "../pong/quickjs.js";
import {
  CANONICAL_SAYSO_NETWORK_AGENT,
  pongAgentId,
  registerPongWithNetwork,
} from "../pong/networkRegistration.js";
import type { SaySoCodecContent } from "../sayso/codecs.js";

type AgentState = {
  walletAddress: string;
  explained: Set<string>;
  connected: Set<string>;
  xmtpConnections: Set<string>;
  identities: Map<string, SenderIdentity>;
  configuration: PongRuntimeConfiguration;
  sourceSnapshots: PongSourceSnapshotStore;
  application: PongApplication;
};

const proactiveAgentInfoDelayMs = 500;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const infoDebugEnabled = () => (process.env.DEBUG ?? "").split(/[\s,]+/).includes("info");

const xmtpErrorDetails = (error: Error) => {
  const details: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
  for (const property of Object.getOwnPropertyNames(error)) {
    if (property in details) continue;
    details[property] = (error as unknown as Record<string, unknown>)[property];
  }
  if ("cause" in error) details.cause = error.cause;
  return details;
};

const logXmtpInfo = (event: string, fields: Record<string, unknown>) => {
  if (!infoDebugEnabled()) return;
  console.info(`[xmtp:info] ${event}`, fields);
};

const contentTypeLabel = (contentType?: ContentTypeId) =>
  contentType ? contentTypeName(contentType) : "unknown";

const senderIdentityFor = async (client: SaySoClient, state: AgentState, senderInboxId: string) => {
  const cached = state.identities.get(senderInboxId);
  if (cached) return cached;
  const identity = await describeSenderIdentity(client, senderInboxId);
  state.identities.set(senderInboxId, identity);
  return identity;
};

const debugSenderIdentityFor = async (client: SaySoClient, state: AgentState, senderInboxId: string) => {
  if (!infoDebugEnabled()) return { senderInboxId };
  return senderIdentityFor(client, state, senderInboxId);
};

const logXmtpStreamError = (input: {
  client: SaySoClient;
  state: AgentState;
  stream: string;
  error: Error;
}) => {
  console.error(`XMTP ${input.stream} stream error:`, input.error);
  console.error("XMTP stream error details:", {
    stream: input.stream,
    inboxId: input.client.inboxId,
    installationId: input.client.installationId,
    explainedCount: input.state.explained.size,
    connectedCount: input.state.connected.size,
    xmtpConnectionCount: input.state.xmtpConnections.size,
    error: xmtpErrorDetails(input.error),
  });
};

const getConversationForMessage = async (
  client: SaySoClient,
  message: DecodedMessage<SaySoCodecContent>,
): Promise<SaySoSendConversation | null> => {
  const conversation = await client.conversations.getConversationById(message.conversationId);
  return conversation as SaySoSendConversation | null;
};

const agentIdentity = (syncInboxId: string, walletAddress: string) => ({
  agentId: pongAgentId(walletAddress),
  syncInboxId,
  displayName: "SaySo Demo Pong",
});

const sendAgentInfoOnce = async (
  client: SaySoClient,
  state: AgentState,
  conversation: SaySoSendConversation,
  senderInboxId: string,
  syncInboxId: string,
) => {
  if (state.explained.has(senderInboxId)) return;
  state.explained.add(senderInboxId);
  const agent = agentIdentity(syncInboxId, state.walletAddress);
  try {
    await sendLoggedTyped(
      client,
      state,
      conversation,
      senderInboxId,
      createAgentInfo({
        agent,
        fallbackText: PRE_CONNECTION_EXPLANATION,
        skillPacket: await state.application.skillPacket(agent),
      }),
      CONTENT_TYPES.agentInfo,
    );
  } catch (error) {
    state.explained.delete(senderInboxId);
    throw error;
  }
};

const sendCoreError = async (
  client: SaySoClient,
  state: AgentState,
  conversation: SaySoSendConversation,
  senderInboxId: string,
  code: Parameters<typeof createError>[0],
  message: string,
  requestId?: string,
) => {
  await sendLoggedTyped(client, state, conversation, senderInboxId, createError(code, message, requestId), CONTENT_TYPES.error);
};

const logXmtpConnectionOnce = async (
  client: SaySoClient,
  state: AgentState,
  senderInboxId: string,
  conversationId: string,
) => {
  if (state.xmtpConnections.has(conversationId)) return false;
  state.xmtpConnections.add(conversationId);
  const identity = await senderIdentityFor(client, state, senderInboxId);
  console.log(
    `New XMTP connection: inbox=${identity.senderInboxId} wallet=${identity.walletAddress ?? "unknown"} conversation=${conversationId}`,
  );
  logXmtpInfo("connection.seen", {
    inbox: identity.senderInboxId,
    address: identity.walletAddress ?? null,
    conversationId,
  });
  return true;
};

const sendLoggedTyped = async (
  client: SaySoClient,
  state: AgentState,
  conversation: SaySoSendConversation,
  recipientInboxId: string,
  content: SaySoCodecContent,
  contentType?: ContentTypeId,
) => {
  const recipientIdentity = await debugSenderIdentityFor(client, state, recipientInboxId);
  const key = contentTypeKey(contentType);
  logXmtpInfo("message.send.start", {
    direction: "sent",
    inbox: recipientInboxId,
    address: recipientIdentity.walletAddress ?? null,
    contentType: contentTypeLabel(contentType),
    contentTypeKey: key,
  });
  try {
    await sendTyped(conversation, content, contentType);
    logXmtpInfo("message.sent", {
      direction: "sent",
      inbox: recipientInboxId,
      address: recipientIdentity.walletAddress ?? null,
      contentType: contentTypeLabel(contentType),
      contentTypeKey: key,
    });
  } catch (error) {
    logXmtpInfo("message.send.failed", {
      direction: "sent",
      inbox: recipientInboxId,
      address: recipientIdentity.walletAddress ?? null,
      contentType: contentTypeLabel(contentType),
      contentTypeKey: key,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

const sendApplicationReplies = async (
  client: SaySoClient,
  state: AgentState,
  conversation: SaySoSendConversation,
  senderInboxId: string,
  replies: PongApplicationReply[] | null,
) => {
  if (!replies?.length) return false;
  for (const reply of replies) {
    await sendLoggedTyped(client, state, conversation, senderInboxId, reply.content, reply.contentType);
  }
  return true;
};

const handleMessage = async (
  client: SaySoClient,
  state: AgentState,
  message: DecodedMessage<SaySoCodecContent>,
) => {
  if (message.senderInboxId === client.inboxId) return;
  const conversation = await getConversationForMessage(client, message);
  if (!conversation) return;

  const senderInboxId = message.senderInboxId;
  await logXmtpConnectionOnce(client, state, senderInboxId, message.conversationId);
  const key = contentTypeKey(message.contentType);
  const content = message.content;
  const senderIdentity = await debugSenderIdentityFor(client, state, senderInboxId);
  logXmtpInfo("message.received", {
    direction: "received",
    inbox: senderInboxId,
    address: senderIdentity.walletAddress ?? null,
    conversationId: message.conversationId,
    contentType: contentTypeLabel(message.contentType),
    contentTypeKey: key,
  });

  if (!state.connected.has(senderInboxId) && key !== "connectionRequest") {
    await sendAgentInfoOnce(client, state, conversation, senderInboxId, client.inboxId);
    if (key) {
      await sendCoreError(client, state, conversation, senderInboxId, "not-connected", "Send connection-request/1 before protocol or service messages.");
    }
    return;
  }

  switch (key) {
    case "connectionRequest": {
      await sendAgentInfoOnce(client, state, conversation, senderInboxId, client.inboxId);
      if (!isConnectionRequest(content)) {
        if (isRecord(content) && "presentations" in content) {
          await sendLoggedTyped(
            client,
            state,
            conversation,
            senderInboxId,
            createConnectionError("presentation-malformed", "connection-request/1 presentations must be claim presentation objects."),
            CONTENT_TYPES.connectionResponse,
          );
          return;
        }
        await sendCoreError(client, state, conversation, senderInboxId, "malformed", "connection-request/1 payload must be {} or { presentations: [...] }.");
        return;
      }
      if (content.presentations?.length) {
        await sendLoggedTyped(
          client,
          state,
          conversation,
          senderInboxId,
          createConnectionError("presentation-unsupported", "This agent does not advertise support for claim presentations."),
          CONTENT_TYPES.connectionResponse,
        );
        return;
      }
      const agent = agentIdentity(client.inboxId, state.walletAddress);
      const response = await state.application.handleConnectionRequest({
        agent,
        senderInboxId,
        conversationId: message.conversationId,
        presentations: content.presentations,
      });
      if (response.status === "ok") state.connected.add(senderInboxId);
      else state.connected.delete(senderInboxId);
      await sendLoggedTyped(
        client,
        state,
        conversation,
        senderInboxId,
        response,
        CONTENT_TYPES.connectionResponse,
      );
      return;
    }
    case "skillRequest": {
      const request = parseSkillRequest(content);
      if (!request) {
        await sendCoreError(client, state, conversation, senderInboxId, "malformed", "Invalid skill-request/1 payload.");
        return;
      }
      await sendLoggedTyped(
        client,
        state,
        conversation,
        senderInboxId,
        await state.application.handleSkillRequest({
          agent: agentIdentity(client.inboxId, state.walletAddress),
          senderInboxId,
          conversationId: message.conversationId,
          request,
        }),
        CONTENT_TYPES.skillResponse,
      );
      return;
    }
    case "configurationRequest": {
      await sendApplicationReplies(
        client,
        state,
        conversation,
        senderInboxId,
        await state.application.handleMessage({
          key,
          contentType: contentTypeNameFromKey(key),
          content,
          senderInboxId,
          conversationId: message.conversationId,
        }),
      );
      return;
    }
    case "sourceManifestRequest": {
      await sendApplicationReplies(
        client,
        state,
        conversation,
        senderInboxId,
        await state.application.handleMessage({
          key,
          contentType: contentTypeNameFromKey(key),
          content,
          senderInboxId,
          conversationId: message.conversationId,
        }),
      );
      return;
    }
    case "sourceChunkRequest": {
      await sendApplicationReplies(
        client,
        state,
        conversation,
        senderInboxId,
        await state.application.handleMessage({
          key,
          contentType: contentTypeNameFromKey(key),
          content,
          senderInboxId,
          conversationId: message.conversationId,
        }),
      );
      return;
    }
    case "pingRequest": {
      await sendApplicationReplies(
        client,
        state,
        conversation,
        senderInboxId,
        await state.application.handleMessage({
          key,
          contentType: contentTypeNameFromKey(key),
          content,
          senderInboxId,
          conversationId: message.conversationId,
        }),
      );
      return;
    }
    case "disconnect": {
      state.connected.delete(senderInboxId);
      await sendApplicationReplies(client, state, conversation, senderInboxId, [
        await state.application.disconnect({
          agent: agentIdentity(client.inboxId, state.walletAddress),
          senderInboxId,
          conversationId: message.conversationId,
        }),
      ]);
      return;
    }
    case "forgetMe": {
      state.connected.delete(senderInboxId);
      state.explained.delete(senderInboxId);
      await sendApplicationReplies(client, state, conversation, senderInboxId, [
        await state.application.forgetMe({
          agent: agentIdentity(client.inboxId, state.walletAddress),
          senderInboxId,
          conversationId: message.conversationId,
        }),
      ]);
      return;
    }
    case "connectionResponse":
    case "agentInfo":
    case "skillResponse":
    case "registrationResult":
    case "configurationResponse":
    case "sourceManifestResponse":
    case "sourceChunkResponse":
    case "pongResponse":
    case "disconnectAck":
    case "error":
      return;
    default:
      if (key === null) {
        await sendAgentInfoOnce(client, state, conversation, senderInboxId, client.inboxId);
      } else {
        await sendCoreError(client, state, conversation, senderInboxId, "unknown-type", "Unsupported SaySo content type.");
      }
  }
};

const streamXmtpConnections = async (client: SaySoClient, state: AgentState) => {
  const stream = await client.conversations.streamDms({
    disableSync: true,
    onError: (error) => logXmtpStreamError({ client, state, stream: "conversation", error }),
  });
  for await (const conversation of stream) {
    try {
      const dm = conversation as Dm<SaySoCodecContent>;
      if (dm.peerInboxId === client.inboxId) continue;
      await logXmtpConnectionOnce(client, state, dm.peerInboxId, dm.id);
      await wait(proactiveAgentInfoDelayMs);
      if (state.connected.has(dm.peerInboxId) || state.explained.has(dm.peerInboxId)) continue;
      await dm.sync();
      await sendAgentInfoOnce(client, state, dm, dm.peerInboxId, client.inboxId);
    } catch (error) {
      console.error("Failed to handle XMTP connection:", error);
    }
  }
};

const createQuickJsSigner = (walletAddress: string, signer: Signer) => ({
  getAccount: () => ({
    kind: "ethereum",
    address: walletAddress,
    signerType: signer.type,
  }),
  signMessage: async (input: Record<string, unknown>) => {
    if (typeof input.message !== "string") throw new Error("signer.signMessage requires a string message.");
    const signature = await signer.signMessage(input.message);
    return {
      account: {
        kind: "ethereum",
        address: walletAddress,
        signerType: signer.type,
      },
      signature: `0x${Buffer.from(signature).toString("hex")}`,
      signatureEncoding: "hex",
      scheme: "eip191",
    };
  },
});

const program = new Command();
program
  .name("sayso-pong-agent")
  .description("Start a no-payment SaySo pong agent over XMTP.")
  .showHelpAfterError();

addCommonOptions(program);

program
  .option(
    "--network-agent <wallet-or-inbox>",
    "SaySo Network registry wallet address or XMTP inbox ID. Falls back to SAYSO_NETWORK_AGENT or the canonical registry.",
  )
  .option("--stream-connections", "Also stream passive XMTP DM creation events and proactively send agent-info/1.")
  .option("--skip-network-registration", "Do not register the pong agent with SaySo Network on startup.")
  .option("--network-registration-timeout-ms <ms>", "SaySo Network registration timeout in milliseconds.", "30000")
  .option("--runtime <runtime>", "Pong application runtime: native or quickjs.", "native");

program.action(async () => {
  const options = {
    ...getCommonOptions(program),
    ...program.opts<{
      networkAgent?: string;
      streamConnections?: boolean;
      skipNetworkRegistration?: boolean;
      networkRegistrationTimeoutMs: string;
      runtime?: string;
    }>(),
  };
  if (options.runtime !== "native" && options.runtime !== "quickjs") {
    throw new Error("--runtime must be native or quickjs.");
  }
  const networkRegistrationTimeoutMs = Number.parseInt(options.networkRegistrationTimeoutMs, 10);
  if (!Number.isFinite(networkRegistrationTimeoutMs) || networkRegistrationTimeoutMs <= 0) {
    throw new Error("--network-registration-timeout-ms must be a positive integer.");
  }
  const { client, walletAddress, signer } = await createXmtpClient("pong-agent", options);
  const networkAgent = options.networkAgent ?? process.env.SAYSO_NETWORK_AGENT ?? CANONICAL_SAYSO_NETWORK_AGENT;
  const configuration = {
    xmtpEnv: options.env,
    networkAgent,
    debug: process.env.DEBUG,
    dbDir: options.dbDir,
  };
  const sourceSnapshots: PongSourceSnapshotStore = new Map();
  const agent = agentIdentity(client.inboxId, walletAddress);
  const application =
    options.runtime === "quickjs"
      ? await createQuickJsPongApplication({
          agent,
          configuration,
          sourceSnapshots,
          host: {
            signer: createQuickJsSigner(walletAddress, signer),
            networkPolicy: () => false,
          },
        })
      : createNativePongApplication({
          walletAddress,
          configuration,
          sourceSnapshots,
        });
  const state: AgentState = {
    walletAddress,
    explained: new Set(),
    connected: new Set(),
    xmtpConnections: new Set(),
    identities: new Map(),
    configuration,
    sourceSnapshots,
    application,
  };

  console.log("SaySo pong agent running");
  console.log(`Wallet: ${walletAddress}`);
  console.log(`Agent ID: ${pongAgentId(walletAddress)}`);
  console.log(`Inbox ID: ${client.inboxId}`);
  console.log(`Environment: ${options.env}`);
  console.log(`Runtime: ${options.runtime}`);
  console.log(`Connection request type: ${contentTypeNameFromKey("connectionRequest")}`);

  await client.conversations.syncAll();
  if (options.skipNetworkRegistration) {
    console.log("Skipping SaySo Network registration.");
  } else {
    console.log(`Registering with SaySo Network: ${networkAgent}`);
    try {
      const result = await registerPongWithNetwork({
        client,
        walletAddress,
        networkAgent,
        timeoutMs: networkRegistrationTimeoutMs,
      });
      if (result.status === "accepted") {
        console.log(`SaySo Network registration accepted: ${result.registrationId} visibility=${result.visibility}`);
      } else {
        console.warn(`SaySo Network registration rejected: ${result.error.code}: ${result.error.message}`);
      }
    } catch (error) {
      console.warn(
        `SaySo Network registration failed; continuing without registry listing: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  console.log("Waiting for messages...");

  const stream = await client.conversations.streamAllMessages({
    onError: (error) => logXmtpStreamError({ client, state, stream: "message", error }),
  });
  if (options.streamConnections) {
    void streamXmtpConnections(client, state).catch((error) => {
      console.error("XMTP conversation stream stopped:", error);
    });
  }
  for await (const message of stream) {
    try {
      await handleMessage(client, state, message as DecodedMessage<SaySoCodecContent>);
    } catch (error) {
      console.error("Failed to handle message:", error);
    }
  }
});

await program.parseAsync();
