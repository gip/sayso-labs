import { randomUUID } from "node:crypto";
import type { DecodedMessage } from "@xmtp/node-sdk";
import type { ContentTypeId } from "@xmtp/content-type-primitives";
import { CONTENT_TYPES, contentTypeKey } from "../sayso/contentTypes.js";
import { getOrCreateDm, sendTyped, type SaySoClient, type SaySoConversation } from "../sayso/xmtp.js";
import type {
  ConnectionResponsePayload,
  RegistrationResultPayload,
  RegistrationSubmitPayload,
} from "../sayso/types.js";
import type { SaySoCodecContent } from "../sayso/codecs.js";
import { createOracleSkillPacket, oracleAgentId, ORACLE_DISPLAY_NAME } from "./skill.js";

export const CANONICAL_SAYSO_NETWORK_AGENT = "0xc9F639A95813C834967FB8a38f749eA5F0b5CdD9";

export const ORACLE_NETWORK_DESCRIPTION =
  "No-payment SaySo finance oracle that returns Coinbase spot ticker prices for configured markets.";

type WaitPredicate = (message: DecodedMessage<SaySoCodecContent>) => boolean;

const waitForMessage = async (
  conversation: SaySoConversation,
  ownInboxId: string,
  predicate: WaitPredicate,
  timeoutMs: number,
): Promise<DecodedMessage<SaySoCodecContent>> => {
  const stream = await conversation.stream();
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      (async () => {
        for await (const message of stream) {
          const typedMessage = message as DecodedMessage<SaySoCodecContent>;
          if (typedMessage.senderInboxId === ownInboxId) continue;
          if (predicate(typedMessage)) return typedMessage;
        }
        throw new Error("XMTP stream ended before receiving expected response.");
      })(),
      new Promise<DecodedMessage<SaySoCodecContent>>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Timed out waiting for response.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
    await stream.end();
  }
};

const sendAndWait = async (
  conversation: SaySoConversation,
  ownInboxId: string,
  content: SaySoCodecContent,
  contentType: ContentTypeId,
  expectedKey: ReturnType<typeof contentTypeKey>,
  timeoutMs: number,
) => {
  const pending = waitForMessage(
    conversation,
    ownInboxId,
    (message) => contentTypeKey(message.contentType) === expectedKey,
    timeoutMs,
  );
  await sendTyped(conversation, content, contentType);
  return pending;
};

export const createOracleNetworkRegistration = (input: {
  syncInboxId: string;
  walletAddress: string;
}): RegistrationSubmitPayload => {
  const agent = {
    agentId: oracleAgentId(input.walletAddress),
    syncInboxId: input.syncInboxId,
    displayName: ORACLE_DISPLAY_NAME,
  };
  return {
    requestId: `network_reg_${randomUUID()}`,
    agent: {
      ...agent,
      protocolVersion: "0.1.0",
    },
    visibility: "public",
    profile: {
      description: ORACLE_NETWORK_DESCRIPTION,
      skillDisclosure: "include-skill-packet",
      skillPacket: createOracleSkillPacket(agent),
    },
  };
};

export const registerOracleWithNetwork = async (input: {
  client: SaySoClient;
  walletAddress: string;
  networkAgent: string;
  timeoutMs: number;
}): Promise<RegistrationResultPayload> => {
  const conversation = await getOrCreateDm(input.client, input.networkAgent);
  const connectionMessage = await sendAndWait(
    conversation,
    input.client.inboxId,
    {},
    CONTENT_TYPES.connectionRequest,
    "connectionResponse",
    input.timeoutMs,
  );
  const connection = connectionMessage.content as ConnectionResponsePayload;
  if (connection.status !== "ok") {
    throw new Error(`SaySo Network connection rejected: ${connection.error.code}: ${connection.error.message}`);
  }

  const payload = createOracleNetworkRegistration({
    syncInboxId: input.client.inboxId,
    walletAddress: input.walletAddress,
  });
  const resultMessage = await sendAndWait(
    conversation,
    input.client.inboxId,
    payload,
    CONTENT_TYPES.registrationSubmit,
    "registrationResult",
    input.timeoutMs,
  );
  return resultMessage.content as RegistrationResultPayload;
};
