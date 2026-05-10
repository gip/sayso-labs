import { readFileSync } from "node:fs";
import type { ContentTypeId } from "@xmtp/content-type-primitives";
import type { CoinbaseTickerCache, CoinbaseTickerSnapshot } from "../coinbase/ticker.js";
import { contentTypeFromName } from "../sayso/contentTypes.js";
import { createQuickJsApplication, type JsonObject, type JsonValue, type SaySoRuntimeHostOptions } from "../sayso/quickjs.js";
import type {
  ConnectionResponsePayload,
  SkillPacket,
  SkillResponsePayload,
} from "../sayso/types.js";
import type { OracleApplication, OracleApplicationReply, OracleAgentIdentity } from "./application.js";
import type { OracleRuntimeConfiguration } from "./configuration.js";
import { createOracleResolvedSkill, createOracleSkillPacket, oracleSkillDocuments } from "./skill.js";

export const ORACLE_RUNTIME_APP_FILENAME = "runtime-app.js";

export const readOracleRuntimeAppSource = () =>
  readFileSync(new URL(ORACLE_RUNTIME_APP_FILENAME, import.meta.url), "utf8");

type QuickJsReply = {
  contentType: string;
  content: JsonValue;
};

const asJsonObject = (value: unknown, label: string): JsonObject => {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as JsonObject;
};

const asReplyArray = (value: JsonValue): QuickJsReply[] | null => {
  if (value === null) return null;
  if (!Array.isArray(value)) throw new Error("QuickJS oracle reply must be an array or null.");
  return value.map((item) => {
    const reply = asJsonObject(item, "QuickJS oracle reply");
    if (typeof reply.contentType !== "string") throw new Error("QuickJS oracle reply requires a string contentType.");
    if (!Object.prototype.hasOwnProperty.call(reply, "content")) {
      throw new Error("QuickJS oracle reply requires content.");
    }
    return reply as QuickJsReply;
  });
};

const contentTypeForReply = (name: string): ContentTypeId => {
  const contentType = contentTypeFromName(name);
  if (!contentType) throw new Error(`QuickJS oracle returned unsupported content type ${name}.`);
  return contentType;
};

const toApplicationReplies = (value: JsonValue): OracleApplicationReply[] | null => {
  const replies = asReplyArray(value);
  if (!replies) return null;
  return replies.map((reply) => ({
    content: reply.content as unknown as OracleApplicationReply["content"],
    contentType: contentTypeForReply(reply.contentType),
  }));
};

const configurationForRuntime = (configuration: OracleRuntimeConfiguration): JsonObject => ({
  markets: [...configuration.markets],
  staleAfterMs: configuration.staleAfterMs,
  coinbaseWsUrl: configuration.coinbaseWsUrl,
  coinbaseAuthenticated: configuration.coinbaseAuthenticated,
  xmtpEnv: configuration.xmtpEnv,
  ...(configuration.networkAgent ? { networkAgent: configuration.networkAgent } : {}),
  ...(configuration.debug ? { debug: configuration.debug } : {}),
  dbDir: configuration.dbDir,
});

const tickerSnapshotForRuntime = (snapshot: CoinbaseTickerSnapshot): JsonObject => ({
  productId: snapshot.productId,
  price: snapshot.price,
  ...(snapshot.bestBid ? { bestBid: snapshot.bestBid } : {}),
  ...(snapshot.bestAsk ? { bestAsk: snapshot.bestAsk } : {}),
  asOf: snapshot.asOf,
  ...(snapshot.sequenceNum !== undefined ? { sequenceNum: snapshot.sequenceNum } : {}),
  receivedAtMs: snapshot.receivedAtMs,
});

const tickerCacheForRuntime = (cache: CoinbaseTickerCache): JsonObject =>
  Object.fromEntries([...cache.entries()].map(([productId, snapshot]) => [productId, tickerSnapshotForRuntime(snapshot)]));

export const createQuickJsOracleApplication = async (input: {
  agent: OracleAgentIdentity;
  configuration: OracleRuntimeConfiguration;
  host?: Omit<SaySoRuntimeHostOptions, "params" | "operations">;
}): Promise<OracleApplication & { dispose(): void }> => {
  const skillPacket = createOracleSkillPacket(input.agent);
  const quickJs = await createQuickJsApplication(readOracleRuntimeAppSource(), {
    ...input.host,
    params: {
      agent: input.agent,
      configuration: configurationForRuntime(input.configuration),
      skillPacket: skillPacket as unknown as JsonObject,
      resolvedSkill: createOracleResolvedSkill(input.agent.syncInboxId) as unknown as JsonObject,
      skills: oracleSkillDocuments() as unknown as JsonValue,
    },
  });

  return {
    skillPacket: async (agent) =>
      quickJs.call("skillPacket", { agent: agent as unknown as JsonObject }) as Promise<SkillPacket>,
    handleConnectionRequest: async (request) =>
      quickJs.call("handleConnectionRequest", {
        agent: request.agent as unknown as JsonObject,
        senderInboxId: request.senderInboxId,
        conversationId: request.conversationId,
        ...(request.presentations ? { presentations: request.presentations as unknown as JsonValue } : {}),
      }) as Promise<ConnectionResponsePayload>,
    handleSkillRequest: async (request) =>
      quickJs.call("handleSkillRequest", request as unknown as JsonObject) as Promise<SkillResponsePayload>,
    handleMessage: async (message) =>
      toApplicationReplies(
        await quickJs.call("handleMessage", {
          key: message.key,
          contentType: message.contentType,
          content: message.content as unknown as JsonValue,
          senderInboxId: message.senderInboxId,
          conversationId: message.conversationId,
          tickerCache: tickerCacheForRuntime(message.tickerCache),
        }),
      ),
    disconnect: async (request) => {
      const replies = toApplicationReplies(await quickJs.call("disconnect", request as unknown as JsonObject));
      if (!replies?.[0]) throw new Error("QuickJS oracle disconnect did not return a reply.");
      return replies[0];
    },
    forgetMe: async (request) => {
      const replies = toApplicationReplies(await quickJs.call("forgetMe", request as unknown as JsonObject));
      if (!replies?.[0]) throw new Error("QuickJS oracle forgetMe did not return a reply.");
      return replies[0];
    },
    dispose: quickJs.dispose,
  };
};
