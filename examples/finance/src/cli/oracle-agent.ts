#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import type { DecodedMessage, Dm, Signer } from "@xmtp/node-sdk";
import type { ContentTypeId } from "@xmtp/content-type-primitives";
import { CoinbaseTickerWebSocket, type CoinbaseWebSocketStatus } from "../coinbase/websocket.js";
import type { CoinbaseTickerCache } from "../coinbase/ticker.js";
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
import type { SaySoCodecContent } from "../sayso/codecs.js";
import type { OracleRuntimeConfiguration } from "../oracle/configuration.js";
import { createNativeOracleApplication, type OracleApplication, type OracleApplicationReply } from "../oracle/application.js";
import { createQuickJsOracleApplication } from "../oracle/quickjs.js";
import { parseMarketList } from "../oracle/markets.js";
import {
  oracleAgentId,
  ORACLE_DISPLAY_NAME,
} from "../oracle/skill.js";
import {
  CANONICAL_SAYSO_NETWORK_AGENT,
  registerOracleWithNetwork,
} from "../oracle/networkRegistration.js";

type AgentState = {
  walletAddress: string;
  explained: Set<string>;
  connected: Set<string>;
  xmtpConnections: Set<string>;
  identities: Map<string, SenderIdentity>;
  configuration: OracleRuntimeConfiguration;
  tickerCache: CoinbaseTickerCache;
  coinbaseStatus: CoinbaseWebSocketStatus;
  application: OracleApplication;
};

const proactiveAgentInfoDelayMs = 500;
const defaultCoinbaseWsUrl = "wss://advanced-trade-ws.coinbase.com";
const defaultStaleAfterMs = 30_000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const infoDebugEnabled = () => (process.env.DEBUG ?? "").split(/[\s,]+/).includes("info");

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

const logXmtpInfo = (event: string, fields: Record<string, unknown>) => {
  if (!infoDebugEnabled()) return;
  console.info(`[xmtp:info] ${event}`, fields);
};

const getConversationForMessage = async (
  client: SaySoClient,
  message: DecodedMessage<SaySoCodecContent>,
): Promise<SaySoSendConversation | null> => {
  const conversation = await client.conversations.getConversationById(message.conversationId);
  return conversation as SaySoSendConversation | null;
};

const agentIdentity = (syncInboxId: string, walletAddress: string) => ({
  agentId: oracleAgentId(walletAddress),
  syncInboxId,
  displayName: ORACLE_DISPLAY_NAME,
});

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
  await sendTyped(conversation, content, contentType);
  logXmtpInfo("message.sent", {
    direction: "sent",
    inbox: recipientInboxId,
    address: recipientIdentity.walletAddress ?? null,
    contentType: contentTypeLabel(contentType),
    contentTypeKey: key,
  });
};

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

const sendApplicationReplies = async (
  client: SaySoClient,
  state: AgentState,
  conversation: SaySoSendConversation,
  senderInboxId: string,
  replies: OracleApplicationReply[] | null,
) => {
  if (!replies) return;
  for (const reply of replies) {
    await sendLoggedTyped(client, state, conversation, senderInboxId, reply.content, reply.contentType);
  }
};

const logXmtpConnectionOnce = async (
  client: SaySoClient,
  state: AgentState,
  senderInboxId: string,
  conversationId: string,
) => {
  if (state.xmtpConnections.has(conversationId)) return;
  state.xmtpConnections.add(conversationId);
  const identity = await senderIdentityFor(client, state, senderInboxId);
  console.log(
    `New XMTP connection: inbox=${identity.senderInboxId} wallet=${identity.walletAddress ?? "unknown"} conversation=${conversationId}`,
  );
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
  logXmtpInfo("message.received", {
    direction: "received",
    inbox: senderInboxId,
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
      const agent = agentIdentity(client.inboxId, state.walletAddress);
      const response = await state.application.handleConnectionRequest({
        agent,
        senderInboxId,
        conversationId: message.conversationId,
        presentations: content.presentations,
      });
      if (response.status === "ok") state.connected.add(senderInboxId);
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
          tickerCache: state.tickerCache,
        }),
      );
      return;
    }
    case "spotPriceRequest": {
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
          tickerCache: state.tickerCache,
        }),
      );
      return;
    }
    case "disconnect": {
      state.connected.delete(senderInboxId);
      await sendApplicationReplies(
        client,
        state,
        conversation,
        senderInboxId,
        [
          await state.application.disconnect({
            agent: agentIdentity(client.inboxId, state.walletAddress),
            senderInboxId,
            conversationId: message.conversationId,
          }),
        ],
      );
      return;
    }
    case "forgetMe": {
      state.connected.delete(senderInboxId);
      state.explained.delete(senderInboxId);
      await sendApplicationReplies(
        client,
        state,
        conversation,
        senderInboxId,
        [
          await state.application.forgetMe({
            agent: agentIdentity(client.inboxId, state.walletAddress),
            senderInboxId,
            conversationId: message.conversationId,
          }),
        ],
      );
      return;
    }
    case "agentInfo":
    case "connectionResponse":
    case "skillResponse":
    case "configurationResponse":
    case "spotPriceResponse":
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
    onError: (error) => console.error("XMTP conversation stream error:", error),
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

const parsePositiveInteger = (value: string, name: string) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
};

const readCoinbaseAuth = () => {
  const keyName = process.env.COINBASE_API_KEY_NAME;
  const privateKey = process.env.COINBASE_API_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!keyName && !privateKey) return undefined;
  if (!keyName || !privateKey) {
    throw new Error("Set both COINBASE_API_KEY_NAME and COINBASE_API_PRIVATE_KEY, or unset both to use public Coinbase market data.");
  }
  return { keyName, privateKey };
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
  .name("sayso-oracle")
  .description("Start a no-payment SaySo spot price oracle over XMTP.")
  .showHelpAfterError();

addCommonOptions(program);

program
  .option("--markets <markets>", "Comma-separated supported markets. Falls back to SAYSO_ORACLE_MARKETS.")
  .option("--coinbase-ws-url <url>", "Coinbase Advanced Trade WebSocket URL. Falls back to COINBASE_WS_URL.")
  .option("--stale-after-ms <ms>", "Ticker cache staleness threshold in milliseconds. Falls back to SAYSO_ORACLE_STALE_AFTER_MS.")
  .option("--network-agent <wallet-or-inbox>", "SaySo Network registry wallet address or XMTP inbox ID. Falls back to SAYSO_NETWORK_AGENT or the canonical registry.")
  .option("--skip-network-registration", "Do not register the oracle agent with SaySo Network on startup.")
  .option("--network-registration-timeout-ms <ms>", "SaySo Network registration timeout in milliseconds.", "30000")
  .option("--stream-connections", "Also stream passive XMTP DM creation events and proactively send agent-info/1.")
  .option("--runtime <runtime>", "Oracle application runtime: native or quickjs.", "native");

program.action(async () => {
  const options = {
    ...getCommonOptions(program),
    ...program.opts<{
      markets?: string;
      coinbaseWsUrl?: string;
      staleAfterMs?: string;
      networkAgent?: string;
      skipNetworkRegistration?: boolean;
      networkRegistrationTimeoutMs: string;
      streamConnections?: boolean;
      runtime?: string;
    }>(),
  };
  if (options.runtime !== "native" && options.runtime !== "quickjs") {
    throw new Error("--runtime must be native or quickjs.");
  }
  const networkRegistrationTimeoutMs = parsePositiveInteger(options.networkRegistrationTimeoutMs, "--network-registration-timeout-ms");
  const parsedMarkets = parseMarketList(options.markets ?? process.env.SAYSO_ORACLE_MARKETS ?? "");
  if (parsedMarkets.invalid.length > 0) {
    throw new Error(
      `Invalid market value(s): ${parsedMarkets.invalid.join(", ")}. Use forms like BTC/USD, BTC-USD, or BTCUSD.`,
    );
  }
  const configuredMarkets = parsedMarkets.markets;
  if (configuredMarkets.length === 0) {
    throw new Error("At least one supported market is required. Pass --markets or set SAYSO_ORACLE_MARKETS, for example BTC/USD or BTCUSD.");
  }
  const staleAfterMs = parsePositiveInteger(options.staleAfterMs ?? process.env.SAYSO_ORACLE_STALE_AFTER_MS ?? String(defaultStaleAfterMs), "--stale-after-ms");
  const coinbaseWsUrl = options.coinbaseWsUrl ?? process.env.COINBASE_WS_URL ?? defaultCoinbaseWsUrl;
  const networkAgent = options.networkAgent ?? process.env.SAYSO_NETWORK_AGENT ?? CANONICAL_SAYSO_NETWORK_AGENT;
  const coinbaseAuth = readCoinbaseAuth();
  const { client, walletAddress, signer } = await createXmtpClient("sayso-oracle", options);
  const tickerCache: CoinbaseTickerCache = new Map();
  const configuration: OracleRuntimeConfiguration = {
    markets: new Set(configuredMarkets),
    staleAfterMs,
    coinbaseWsUrl,
    coinbaseAuthenticated: Boolean(coinbaseAuth),
    xmtpEnv: options.env,
    networkAgent,
    debug: process.env.DEBUG,
    dbDir: options.dbDir,
  };
  const agent = agentIdentity(client.inboxId, walletAddress);
  const application =
    options.runtime === "quickjs"
      ? await createQuickJsOracleApplication({
          agent,
          configuration,
          host: {
            signer: createQuickJsSigner(walletAddress, signer),
            networkPolicy: () => false,
          },
        })
      : createNativeOracleApplication({
          walletAddress,
          configuration,
        });
  const state: AgentState = {
    walletAddress,
    explained: new Set(),
    connected: new Set(),
    xmtpConnections: new Set(),
    identities: new Map(),
    configuration,
    tickerCache,
    coinbaseStatus: {
      connected: false,
      reconnectAttempts: 0,
    },
    application,
  };

  const coinbase = new CoinbaseTickerWebSocket({
    url: coinbaseWsUrl,
    products: configuredMarkets,
    auth: coinbaseAuth,
    tickerCache,
    onStatus: (status) => {
      state.coinbaseStatus = status;
      if (infoDebugEnabled()) console.info("[coinbase:status]", status);
    },
  });
  coinbase.start();

  console.log("SaySo oracle agent running");
  console.log(`Wallet: ${walletAddress}`);
  console.log(`Agent ID: ${oracleAgentId(walletAddress)}`);
  console.log(`Inbox ID: ${client.inboxId}`);
  console.log(`Environment: ${options.env}`);
  console.log(`Markets: ${configuredMarkets.join(",")}`);
  console.log(`Coinbase WebSocket: ${coinbaseWsUrl}`);
  console.log(`Coinbase auth mode: ${coinbaseAuth ? "authenticated" : "public"}`);
  console.log(`Runtime: ${options.runtime}`);
  console.log(`Connection request type: ${contentTypeNameFromKey("connectionRequest")}`);

  await client.conversations.syncAll();
  if (options.skipNetworkRegistration) {
    console.log("Skipping SaySo Network registration.");
  } else {
    console.log(`Registering with SaySo Network: ${networkAgent}`);
    try {
      const result = await registerOracleWithNetwork({
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
    onError: (error) => console.error("XMTP message stream error:", error),
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
