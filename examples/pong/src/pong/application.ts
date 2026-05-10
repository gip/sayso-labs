import type { ContentTypeId } from "@xmtp/content-type-primitives";
import { CONTENT_TYPES, type ContentTypeKey } from "../sayso/contentTypes.js";
import {
  createConnectionError,
  createConnectionResponse,
  createDisconnectAck,
  createError,
  createSkillResponse,
} from "../sayso/protocol.js";
import type {
  ClaimPresentation,
  ConnectionResponsePayload,
  SkillPacket,
  SkillRequestPayload,
  SkillResponsePayload,
} from "../sayso/types.js";
import { isRecord, parseConfigurationRequest, parseSourceChunkRequest, parseSourceManifestRequest } from "../sayso/validation.js";
import type { SaySoCodecContent } from "../sayso/codecs.js";
import {
  createPongConfigurationError,
  createPongConfigurationResponse,
  type PongRuntimeConfiguration,
} from "./configuration.js";
import { createPongResponse, isPingRequest } from "./handler.js";
import { pongAgentId } from "./networkRegistration.js";
import {
  createPongSourceChunkError,
  createPongSourceChunkResponse,
  createPongSourceManifestResponse,
  type PongSourceSnapshotStore,
} from "./source.js";
import { createPongResolvedSkill, createPongSkillPacket, pongSkillDocuments } from "./skill.js";

export type PongAgentIdentity = {
  agentId: string;
  syncInboxId: string;
  displayName: string;
};

export type PongApplicationReply = {
  content: SaySoCodecContent;
  contentType: ContentTypeId;
};

export type PongApplicationMessageInput = {
  key: ContentTypeKey;
  contentType: string;
  content: unknown;
  senderInboxId: string;
  conversationId: string;
};

export type PongConnectionInput = {
  agent: PongAgentIdentity;
  senderInboxId: string;
  conversationId: string;
  presentations?: ClaimPresentation[];
};

export type PongSkillRequestInput = {
  agent: PongAgentIdentity;
  senderInboxId: string;
  conversationId: string;
  request: SkillRequestPayload;
};

export type PongApplication = {
  skillPacket(agent: PongAgentIdentity): Promise<SkillPacket> | SkillPacket;
  handleConnectionRequest(input: PongConnectionInput): Promise<ConnectionResponsePayload> | ConnectionResponsePayload;
  handleSkillRequest(input: PongSkillRequestInput): Promise<SkillResponsePayload> | SkillResponsePayload;
  handleMessage(input: PongApplicationMessageInput): Promise<PongApplicationReply[] | null> | PongApplicationReply[] | null;
  disconnect(input: PongConnectionInput): Promise<PongApplicationReply> | PongApplicationReply;
  forgetMe(input: PongConnectionInput): Promise<PongApplicationReply> | PongApplicationReply;
};

const requestIdFromContent = (content: unknown) =>
  isRecord(content) && typeof content.requestId === "string" ? content.requestId : null;

export const createNativePongApplication = (input: {
  walletAddress: string;
  configuration: PongRuntimeConfiguration;
  sourceSnapshots: PongSourceSnapshotStore;
}): PongApplication => ({
  skillPacket: (agent) => createPongSkillPacket(agent),
  handleConnectionRequest: ({ agent, presentations }) => {
    if (presentations?.length) {
      return createConnectionError("presentation-unsupported", "This agent does not advertise support for claim presentations.");
    }
    return createConnectionResponse({
      ...agent,
      skillPacket: createPongSkillPacket(agent),
    });
  },
  handleSkillRequest: ({ request, agent }) =>
    createSkillResponse({
      agent: {
        agentId: pongAgentId(input.walletAddress),
        kind: "service",
        syncInboxId: agent.syncInboxId,
        displayName: agent.displayName,
      },
      resolvedSkill: createPongResolvedSkill(agent.syncInboxId),
      skills: pongSkillDocuments(),
      request,
      content: "# SaySo Demo Pong\n\nNo-payment SaySo agent that responds to ping requests.",
    }),
  handleMessage: ({ key, content }) => {
    switch (key) {
      case "configurationRequest": {
        const request = parseConfigurationRequest(content);
        if (!request) {
          const requestId = requestIdFromContent(content);
          if (!requestId) {
            return [
              {
                content: createError("malformed", "Invalid configuration-request/1 payload."),
                contentType: CONTENT_TYPES.error,
              },
            ];
          }
          return [
            {
              content: createPongConfigurationError(requestId, "malformed", "Invalid configuration-request/1 payload."),
              contentType: CONTENT_TYPES.configurationResponse,
            },
          ];
        }
        return [
          {
            content: createPongConfigurationResponse(request, input.configuration),
            contentType: CONTENT_TYPES.configurationResponse,
          },
        ];
      }
      case "sourceManifestRequest": {
        const request = parseSourceManifestRequest(content);
        if (!request) {
          const requestId = requestIdFromContent(content);
          if (!requestId) {
            return [
              {
                content: createError("malformed", "Invalid source-manifest-request/1 payload."),
                contentType: CONTENT_TYPES.error,
              },
            ];
          }
          return [
            {
              content: {
                requestId,
                status: "error",
                error: {
                  code: "malformed",
                  message: "Invalid source-manifest-request/1 payload.",
                },
              },
              contentType: CONTENT_TYPES.sourceManifestResponse,
            },
          ];
        }
        return [
          {
            content: createPongSourceManifestResponse(request, input.sourceSnapshots),
            contentType: CONTENT_TYPES.sourceManifestResponse,
          },
        ];
      }
      case "sourceChunkRequest": {
        const request = parseSourceChunkRequest(content);
        if (!request) {
          const requestId = requestIdFromContent(content);
          if (!requestId) {
            return [
              {
                content: createError("malformed", "Invalid source-chunk-request/1 payload."),
                contentType: CONTENT_TYPES.error,
              },
            ];
          }
          return [
            {
              content: createPongSourceChunkError(requestId, "malformed", "Invalid source-chunk-request/1 payload."),
              contentType: CONTENT_TYPES.sourceChunkResponse,
            },
          ];
        }
        return [
          {
            content: createPongSourceChunkResponse(request, input.sourceSnapshots),
            contentType: CONTENT_TYPES.sourceChunkResponse,
          },
        ];
      }
      case "pingRequest": {
        if (!isPingRequest(content)) {
          return [
            {
              content: createError("malformed", "Invalid ping-request/1 payload."),
              contentType: CONTENT_TYPES.error,
            },
          ];
        }
        return [
          {
            content: createPongResponse(content),
            contentType: CONTENT_TYPES.pongResponse,
          },
        ];
      }
      default:
        return null;
    }
  },
  disconnect: () => ({
    content: createDisconnectAck("disconnect", { closed: ["connection_state"] }),
    contentType: CONTENT_TYPES.disconnectAck,
  }),
  forgetMe: () => ({
    content: createDisconnectAck("forget-me", { deleted: ["connection_state", "onboarding_state"] }),
    contentType: CONTENT_TYPES.disconnectAck,
  }),
});
