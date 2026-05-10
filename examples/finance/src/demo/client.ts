import { randomUUID } from "node:crypto";
import type { DecodedMessage } from "@xmtp/node-sdk";
import type { ContentTypeId } from "@xmtp/content-type-primitives";
import { CONTENT_TYPES, contentTypeKey } from "../sayso/contentTypes.js";
import { getOrCreateDm, sendTyped, type SaySoClient, type SaySoConversation } from "../sayso/xmtp.js";
import type {
  ConfigurationResponsePayload,
  ConnectionResponsePayload,
  SpotPriceResponsePayload,
} from "../sayso/types.js";
import type { SaySoCodecContent } from "../sayso/codecs.js";
import { parseConfiguredMarkets } from "../oracle/markets.js";

type WaitPredicate = (message: DecodedMessage<SaySoCodecContent>) => boolean;

export const waitForMessage = async (
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
        timeout = setTimeout(() => reject(new Error("Timed out waiting for oracle response.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
    await stream.end();
  }
};

export const sendAndWait = async (
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

export const connectToOracle = async (input: {
  client: SaySoClient;
  oracle: string;
  timeoutMs: number;
}) => {
  const conversation = await getOrCreateDm(input.client, input.oracle);
  const message = await sendAndWait(
    conversation,
    input.client.inboxId,
    {},
    CONTENT_TYPES.connectionRequest,
    "connectionResponse",
    input.timeoutMs,
  );
  const connection = message.content as ConnectionResponsePayload;
  if (connection.status !== "ok") {
    throw new Error(`Oracle connection rejected: ${connection.error.code}: ${connection.error.message}`);
  }
  return { conversation, connection };
};

export const fetchSupportedMarkets = async (input: {
  conversation: SaySoConversation;
  ownInboxId: string;
  timeoutMs: number;
}) => {
  const requestId = `config_${randomUUID()}`;
  const message = await sendAndWait(
    input.conversation,
    input.ownInboxId,
    {
      requestId,
      names: ["SAYSO_ORACLE_MARKETS"],
    },
    CONTENT_TYPES.configurationRequest,
    "configurationResponse",
    input.timeoutMs,
  );
  const response = message.content as ConfigurationResponsePayload;
  if (response.status === "error") {
    throw new Error(`Oracle configuration request failed: ${response.error.code}: ${response.error.message}`);
  }
  const value = response.variables.find((variable) => variable.name === "SAYSO_ORACLE_MARKETS")?.value;
  return typeof value === "string" ? parseConfiguredMarkets(value) : [];
};

export const fetchSpotPrices = async (input: {
  conversation: SaySoConversation;
  ownInboxId: string;
  markets: string[];
  timeoutMs: number;
}): Promise<SpotPriceResponsePayload> => {
  const requestId = `spot_${randomUUID()}`;
  const message = await sendAndWait(
    input.conversation,
    input.ownInboxId,
    {
      requestId,
      markets: input.markets,
    },
    CONTENT_TYPES.spotPriceRequest,
    "spotPriceResponse",
    input.timeoutMs,
  );
  return message.content as SpotPriceResponsePayload;
};
