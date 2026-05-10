import type { DecodedMessage, Dm } from "@xmtp/node-sdk";
import type { ContentTypeId } from "@xmtp/content-type-primitives";
import {
  CONTENT_TYPES,
  contentTypeKey,
  contentTypeName,
  createAgentInfo,
  createError,
  isConnectionRequest,
  parseSkillRequest,
  type SaySoCodecContent,
} from "@sayso-labs/protocol";
import { RegistryService } from "../registry/service.js";
import { sendTyped, type SaySoClient, type SaySoSendConversation } from "./client.js";
import { resolveSenderIdentity, type VerifiedSenderIdentity } from "./identity.js";

type AgentState = {
  explained: Set<string>;
  connected: Set<string>;
  xmtpConnections: Set<string>;
  identities: Map<string, VerifiedSenderIdentity>;
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

const resolveAndCacheSenderIdentity = async (
  client: SaySoClient,
  state: AgentState,
  senderInboxId: string,
  warnOnFailure: boolean,
) => {
  const cached = state.identities.get(senderInboxId);
  if (cached) return cached;
  try {
    const identity = await resolveSenderIdentity(client, senderInboxId);
    state.identities.set(senderInboxId, identity);
    return identity;
  } catch (error) {
    if (warnOnFailure) {
      console.warn(
        `Failed to resolve XMTP identity for inbox=${senderInboxId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return { senderInboxId };
  }
};

const debugSenderIdentityFor = async (client: SaySoClient, state: AgentState, senderInboxId: string) => {
  if (!infoDebugEnabled()) return { senderInboxId };
  return resolveAndCacheSenderIdentity(client, state, senderInboxId, false);
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

const sendAgentInfoOnce = async (
  client: SaySoClient,
  service: RegistryService,
  state: AgentState,
  conversation: SaySoSendConversation,
  senderInboxId: string,
) => {
  if (state.explained.has(senderInboxId)) return;
  state.explained.add(senderInboxId);
  const packet = service.skillPacket();
  try {
    await sendLoggedTyped(
      client,
      state,
      conversation,
      senderInboxId,
      createAgentInfo({
        agent: packet.agent,
        skillPacket: packet,
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

const logXmtpConnectionOnce = (state: AgentState, senderInboxId: string, conversationId: string) => {
  if (state.xmtpConnections.has(conversationId)) return false;
  state.xmtpConnections.add(conversationId);
  console.log(`New XMTP connection: inbox=${senderInboxId} conversation=${conversationId}`);
  return true;
};

const logXmtpConnectionInfo = async (
  client: SaySoClient,
  state: AgentState,
  senderInboxId: string,
  conversationId: string,
) => {
  const senderIdentity = await debugSenderIdentityFor(client, state, senderInboxId);
  logXmtpInfo("connection.seen", {
    inbox: senderInboxId,
    address: senderIdentity.walletAddress ?? null,
    conversationId,
  });
};

const verifiedSenderIdentityFor = async (client: SaySoClient, state: AgentState, senderInboxId: string) => {
  return resolveAndCacheSenderIdentity(client, state, senderInboxId, true);
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

const handleMessage = async (
  client: SaySoClient,
  service: RegistryService,
  state: AgentState,
  message: DecodedMessage<SaySoCodecContent>,
) => {
  if (message.senderInboxId === client.inboxId) return;
  const conversation = await getConversationForMessage(client, message);
  if (!conversation) return;

  const senderInboxId = message.senderInboxId;
  if (logXmtpConnectionOnce(state, senderInboxId, message.conversationId)) {
    await logXmtpConnectionInfo(client, state, senderInboxId, message.conversationId);
  }
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
    await sendAgentInfoOnce(client, service, state, conversation, senderInboxId);
    if (key) await sendCoreError(client, state, conversation, senderInboxId, "not-connected", "Send connection-request/1 before protocol or service messages.");
    return;
  }

  switch (key) {
    case "connectionRequest": {
      await sendAgentInfoOnce(client, service, state, conversation, senderInboxId);
      if (!isConnectionRequest(content)) {
        await sendCoreError(client, state, conversation, senderInboxId, "malformed", "connection-request/1 payload must be {} or { presentations: [...] }.");
        return;
      }
      const verifiedSenderIdentity = await verifiedSenderIdentityFor(client, state, senderInboxId);
      const response = await service.handleConnectionRequest(verifiedSenderIdentity, content.presentations);
      if (response.status === "ok") state.connected.add(senderInboxId);
      await sendLoggedTyped(client, state, conversation, senderInboxId, response, CONTENT_TYPES.connectionResponse);
      return;
    }
    case "skillRequest": {
      const request = parseSkillRequest(content);
      if (!request) {
        await sendCoreError(client, state, conversation, senderInboxId, "malformed", "Invalid skill-request/1 payload.");
        return;
      }
      await sendLoggedTyped(client, state, conversation, senderInboxId, service.handleSkillRequest(request), CONTENT_TYPES.skillResponse);
      return;
    }
    case "registrationSubmit": {
      const verifiedSenderIdentity = await verifiedSenderIdentityFor(client, state, senderInboxId);
      await sendLoggedTyped(client, state, conversation, senderInboxId, await service.handleRegistrationSubmit(verifiedSenderIdentity, content), CONTENT_TYPES.registrationResult);
      return;
    }
    case "premiumRegistrationSubmit": {
      const verifiedSenderIdentity = await verifiedSenderIdentityFor(client, state, senderInboxId);
      const response = await service.handlePremiumRegistrationSubmit(verifiedSenderIdentity, content);
      await sendLoggedTyped(
        client,
        state,
        conversation,
        senderInboxId,
        response,
        "accepts" in response ? CONTENT_TYPES.paymentRequired : CONTENT_TYPES.registrationResult,
      );
      return;
    }
    case "paymentSubmit": {
      const verifiedSenderIdentity = await verifiedSenderIdentityFor(client, state, senderInboxId);
      const response = await service.handlePaymentSubmit(verifiedSenderIdentity, content);
      await sendLoggedTyped(client, state, conversation, senderInboxId, response.paymentResult, CONTENT_TYPES.paymentResult);
      if (response.registrationResult) {
        await sendLoggedTyped(client, state, conversation, senderInboxId, response.registrationResult, CONTENT_TYPES.registrationResult);
      }
      return;
    }
    case "registrationRemove": {
      await sendLoggedTyped(client, state, conversation, senderInboxId, await service.handleRegistrationRemove(senderInboxId, content), CONTENT_TYPES.registrationResult);
      return;
    }
    case "agentQuery": {
      const response = await service.handleAgentQuery(content);
      await sendLoggedTyped(client, state, conversation, senderInboxId, response, "requestId" in response && "results" in response ? CONTENT_TYPES.agentQueryResponse : CONTENT_TYPES.error);
      return;
    }
    case "agentGet": {
      const response = await service.handleAgentGet(senderInboxId, content);
      await sendLoggedTyped(client, state, conversation, senderInboxId, response, "status" in response ? CONTENT_TYPES.agentGetResponse : CONTENT_TYPES.error);
      return;
    }
    case "disconnect": {
      state.connected.delete(senderInboxId);
      await sendLoggedTyped(client, state, conversation, senderInboxId, service.disconnect(), CONTENT_TYPES.disconnectAck);
      return;
    }
    case "forgetMe": {
      state.connected.delete(senderInboxId);
      state.explained.delete(senderInboxId);
      await sendLoggedTyped(client, state, conversation, senderInboxId, service.forgetMe(), CONTENT_TYPES.disconnectAck);
      return;
    }
    case "connectionResponse":
    case "agentInfo":
    case "skillResponse":
    case "registrationResult":
    case "paymentRequired":
    case "paymentResult":
    case "agentQueryResponse":
    case "agentGetResponse":
    case "disconnectAck":
    case "error":
      return;
    default:
      if (key === null) await sendAgentInfoOnce(client, service, state, conversation, senderInboxId);
      else await sendCoreError(client, state, conversation, senderInboxId, "unknown-type", "Unsupported SaySo content type.");
  }
};

const streamXmtpConnections = async (client: SaySoClient, service: RegistryService, state: AgentState) => {
  const stream = await client.conversations.streamDms({
    disableSync: true,
    onError: (error) => logXmtpStreamError({ client, state, stream: "conversation", error }),
  });
  for await (const conversation of stream) {
    try {
      const dm = conversation as Dm<SaySoCodecContent>;
      if (dm.peerInboxId === client.inboxId) continue;
      if (logXmtpConnectionOnce(state, dm.peerInboxId, dm.id)) {
        await logXmtpConnectionInfo(client, state, dm.peerInboxId, dm.id);
      }
      await wait(proactiveAgentInfoDelayMs);
      if (state.connected.has(dm.peerInboxId) || state.explained.has(dm.peerInboxId)) continue;
      await dm.sync();
      await sendAgentInfoOnce(client, service, state, dm, dm.peerInboxId);
    } catch (error) {
      console.error("Failed to handle XMTP connection:", error);
    }
  }
};

export const runRegistryXmtpAgent = async (client: SaySoClient, service: RegistryService) => {
  const state: AgentState = { explained: new Set(), connected: new Set(), xmtpConnections: new Set(), identities: new Map() };
  await client.conversations.syncAll();
  const stream = await client.conversations.streamAllMessages({
    onError: (error) => logXmtpStreamError({ client, state, stream: "message", error }),
  });
  void streamXmtpConnections(client, service, state).catch((error) => {
    console.error("XMTP conversation stream stopped:", error);
  });
  for await (const message of stream) {
    try {
      await handleMessage(client, service, state, message as DecodedMessage<SaySoCodecContent>);
    } catch (error) {
      console.error("Failed to handle message:", error);
    }
  }
};
