import type { ContentTypeId } from "@xmtp/content-type-primitives";
import type { CoinbaseTickerCache } from "../coinbase/ticker.js";
import { CONTENT_TYPES, type ContentTypeKey } from "../sayso/contentTypes.js";
import type { SaySoCodecContent } from "../sayso/codecs.js";
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
import { isRecord, parseConfigurationRequest } from "../sayso/validation.js";
import {
  createOracleConfigurationError,
  createOracleConfigurationResponse,
  type OracleRuntimeConfiguration,
} from "./configuration.js";
import { createSpotPriceResponse, isSpotPriceRequest } from "./handler.js";
import { oracleAgentId, createOracleResolvedSkill, createOracleSkillPacket, oracleSkillDocuments } from "./skill.js";

export type OracleAgentIdentity = {
  agentId: string;
  syncInboxId: string;
  displayName: string;
};

export type OracleApplicationReply = {
  content: SaySoCodecContent;
  contentType: ContentTypeId;
};

export type OracleApplicationMessageInput = {
  key: ContentTypeKey;
  contentType: string;
  content: unknown;
  senderInboxId: string;
  conversationId: string;
  tickerCache: CoinbaseTickerCache;
};

export type OracleConnectionInput = {
  agent: OracleAgentIdentity;
  senderInboxId: string;
  conversationId: string;
  presentations?: ClaimPresentation[];
};

export type OracleSkillRequestInput = {
  agent: OracleAgentIdentity;
  senderInboxId: string;
  conversationId: string;
  request: SkillRequestPayload;
};

export type OracleApplication = {
  skillPacket(agent: OracleAgentIdentity): Promise<SkillPacket> | SkillPacket;
  handleConnectionRequest(input: OracleConnectionInput): Promise<ConnectionResponsePayload> | ConnectionResponsePayload;
  handleSkillRequest(input: OracleSkillRequestInput): Promise<SkillResponsePayload> | SkillResponsePayload;
  handleMessage(input: OracleApplicationMessageInput): Promise<OracleApplicationReply[] | null> | OracleApplicationReply[] | null;
  disconnect(input: OracleConnectionInput): Promise<OracleApplicationReply> | OracleApplicationReply;
  forgetMe(input: OracleConnectionInput): Promise<OracleApplicationReply> | OracleApplicationReply;
};

const requestIdFromContent = (content: unknown) =>
  isRecord(content) && typeof content.requestId === "string" ? content.requestId : null;

const defaultClock = { now: () => new Date() };

export const createNativeOracleApplication = (input: {
  walletAddress: string;
  configuration: OracleRuntimeConfiguration;
  clock?: { now(): Date };
}): OracleApplication => {
  const clock = input.clock ?? defaultClock;
  return {
    skillPacket: (agent) => createOracleSkillPacket(agent),
    handleConnectionRequest: ({ agent, presentations }) => {
      if (presentations?.length) {
        return createConnectionError(
          "presentation-unsupported",
          "This oracle accepts any XMTP sender and does not advertise claim presentations.",
        );
      }
      return createConnectionResponse({
        ...agent,
        skillPacket: createOracleSkillPacket(agent),
      });
    },
    handleSkillRequest: ({ request, agent }) =>
      createSkillResponse({
        agent: {
          agentId: oracleAgentId(input.walletAddress),
          kind: "service",
          syncInboxId: agent.syncInboxId,
          displayName: agent.displayName,
        },
        resolvedSkill: createOracleResolvedSkill(agent.syncInboxId),
        skills: oracleSkillDocuments(),
        request,
        content: "# SaySo Finance Oracle\n\nNo-payment SaySo agent that returns Coinbase spot ticker prices.",
      }),
    handleMessage: ({ key, content, tickerCache }) => {
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
                content: createOracleConfigurationError(requestId, "malformed", "Invalid configuration-request/1 payload."),
                contentType: CONTENT_TYPES.configurationResponse,
              },
            ];
          }
          return [
            {
              content: createOracleConfigurationResponse(request, input.configuration, clock.now().toISOString()),
              contentType: CONTENT_TYPES.configurationResponse,
            },
          ];
        }
        case "spotPriceRequest": {
          if (!isSpotPriceRequest(content)) {
            return [
              {
                content: createError("malformed", "Invalid spot-price-request/1 payload."),
                contentType: CONTENT_TYPES.error,
              },
            ];
          }
          return [
            {
              content: createSpotPriceResponse(content, {
                supportedMarkets: input.configuration.markets,
                tickerCache,
                staleAfterMs: input.configuration.staleAfterMs,
                now: clock.now(),
              }),
              contentType: CONTENT_TYPES.spotPriceResponse,
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
  };
};
