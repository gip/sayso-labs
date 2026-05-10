import { readFileSync } from "node:fs";
import type { ContentTypeId } from "@xmtp/content-type-primitives";
import { contentTypeFromName } from "../sayso/contentTypes.js";
import { createQuickJsApplication, type JsonObject, type JsonValue, type SaySoRuntimeHostOptions } from "../sayso/quickjs.js";
import type {
  ConnectionResponsePayload,
  SkillPacket,
  SkillResponsePayload,
  SourceChunkRequestPayload,
  SourceManifestRequestPayload,
} from "../sayso/types.js";
import type { PongApplication, PongApplicationReply, PongAgentIdentity } from "./application.js";
import type { PongRuntimeConfiguration } from "./configuration.js";
import {
  createPongSourceChunkResponse,
  createPongSourceManifestResponse,
  type PongSourceSnapshotStore,
} from "./source.js";
import { createPongResolvedSkill, createPongSkillPacket, pongSkillDocuments } from "./skill.js";

export const PONG_RUNTIME_APP_FILENAME = "runtime-app.js";

export const readPongRuntimeAppSource = () =>
  readFileSync(new URL(PONG_RUNTIME_APP_FILENAME, import.meta.url), "utf8");

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
  if (!Array.isArray(value)) throw new Error("QuickJS pong reply must be an array or null.");
  return value.map((item) => {
    const reply = asJsonObject(item, "QuickJS pong reply");
    if (typeof reply.contentType !== "string") throw new Error("QuickJS pong reply requires a string contentType.");
    if (!Object.prototype.hasOwnProperty.call(reply, "content")) {
      throw new Error("QuickJS pong reply requires content.");
    }
    return reply as QuickJsReply;
  });
};

const contentTypeForReply = (name: string): ContentTypeId => {
  const contentType = contentTypeFromName(name);
  if (!contentType) throw new Error(`QuickJS pong returned unsupported content type ${name}.`);
  return contentType;
};

const toApplicationReplies = (value: JsonValue): PongApplicationReply[] | null => {
  const replies = asReplyArray(value);
  if (!replies) return null;
  return replies.map((reply) => ({
    content: reply.content as unknown as PongApplicationReply["content"],
    contentType: contentTypeForReply(reply.contentType),
  }));
};

export const createQuickJsPongApplication = async (input: {
  agent: PongAgentIdentity;
  configuration: PongRuntimeConfiguration;
  sourceSnapshots: PongSourceSnapshotStore;
  host?: Omit<SaySoRuntimeHostOptions, "params" | "operations">;
}): Promise<PongApplication & { dispose(): void }> => {
  const skillPacket = createPongSkillPacket(input.agent);
  const quickJs = await createQuickJsApplication(readPongRuntimeAppSource(), {
    ...input.host,
    params: {
      agent: input.agent,
      configuration: input.configuration as unknown as JsonObject,
      skillPacket: skillPacket as unknown as JsonObject,
      resolvedSkill: createPongResolvedSkill(input.agent.syncInboxId) as unknown as JsonObject,
      skills: pongSkillDocuments() as unknown as JsonValue,
    },
    operations: {
      "pong.sourceManifest": (request) =>
        createPongSourceManifestResponse(
          request as unknown as SourceManifestRequestPayload,
          input.sourceSnapshots,
        ) as unknown as JsonValue,
      "pong.sourceChunk": (request) =>
        createPongSourceChunkResponse(
          request as unknown as SourceChunkRequestPayload,
          input.sourceSnapshots,
        ) as unknown as JsonValue,
    },
  });

  return {
    skillPacket: async (agent) =>
      quickJs.call("skillPacket", { agent: agent as unknown as JsonObject }) as Promise<SkillPacket>,
    handleConnectionRequest: async (request) =>
      quickJs.call("handleConnectionRequest", request as unknown as JsonObject) as Promise<ConnectionResponsePayload>,
    handleSkillRequest: async (request) =>
      quickJs.call("handleSkillRequest", request as unknown as JsonObject) as Promise<SkillResponsePayload>,
    handleMessage: async (message) =>
      toApplicationReplies(await quickJs.call("handleMessage", message as unknown as JsonObject)),
    disconnect: async (request) => {
      const replies = toApplicationReplies(await quickJs.call("disconnect", request as unknown as JsonObject));
      if (!replies?.[0]) throw new Error("QuickJS pong disconnect did not return a reply.");
      return replies[0];
    },
    forgetMe: async (request) => {
      const replies = toApplicationReplies(await quickJs.call("forgetMe", request as unknown as JsonObject));
      if (!replies?.[0]) throw new Error("QuickJS pong forgetMe did not return a reply.");
      return replies[0];
    },
    dispose: quickJs.dispose,
  };
};
