import { PRE_CONNECTION_EXPLANATION, SAYSO_PROTOCOL_VERSION } from "./constants.js";
import type {
  AgentInfo,
  AgentSkillContract,
  AgentInfoPayload,
  ConnectionResponsePayload,
  DisconnectAckPayload,
  ErrorPayload,
  SkillPacket,
  SkillRequestPayload,
  SkillResponsePayload,
  VerifiedClaim,
  SaySoSkillDocument,
} from "./types.js";

export { PRE_CONNECTION_EXPLANATION, SAYSO_PROTOCOL_VERSION };

export const createConnectionResponse = (agent: {
  agentId: string;
  syncInboxId: string;
  displayName: string;
  skillPacket: SkillPacket;
  verifiedClaims?: VerifiedClaim[];
}): ConnectionResponsePayload => ({
  status: "ok",
  protocolVersion: SAYSO_PROTOCOL_VERSION,
  supportedProtocolVersions: [SAYSO_PROTOCOL_VERSION],
  agent: {
    agentId: agent.agentId,
    syncInboxId: agent.syncInboxId,
    displayName: agent.displayName,
  },
  next: "sayso.protocol/skill-request/1",
  skillPacket: agent.skillPacket,
  ...(agent.verifiedClaims ? { verifiedClaims: agent.verifiedClaims } : {}),
});

export const createConnectionError = (
  code: ErrorPayload["code"],
  message: string,
): ConnectionResponsePayload => ({
  status: "error",
  supportedProtocolVersions: [SAYSO_PROTOCOL_VERSION],
  error: {
    code: code as ErrorPayload["code"],
    message,
  },
});

export const createAgentInfo = (input: {
  agent: AgentInfo;
  fallbackText?: string;
  skillPacket: SkillPacket;
}): AgentInfoPayload => ({
  protocolVersion: SAYSO_PROTOCOL_VERSION,
  supportedProtocolVersions: [SAYSO_PROTOCOL_VERSION],
  agent: input.agent,
  fallbackText: input.fallbackText ?? PRE_CONNECTION_EXPLANATION,
  skillPacket: input.skillPacket,
});

export const createError = (
  code: ErrorPayload["code"],
  message: string,
  requestId?: string,
): ErrorPayload => ({
  code,
  message,
  ...(requestId ? { requestId } : {}),
});

export const createDisconnectAck = (
  action: "disconnect" | "forget-me",
  details?: Record<string, unknown>,
): DisconnectAckPayload => ({
  action,
  status: "ok",
  ...(details ? { details } : {}),
});

export const createSkillResponse = (input: {
  agent: {
    agentId: string;
    kind: string;
    syncInboxId: string;
    displayName: string;
  };
  resolvedSkill: AgentSkillContract;
  skills: SaySoSkillDocument[];
  request?: SkillRequestPayload;
  content: string;
}): SkillResponsePayload => {
  const mode = input.request?.include ?? "resolved";
  const packet = createSkillPacket({
    agent: {
      ...input.agent,
      protocolVersion: SAYSO_PROTOCOL_VERSION,
    },
    skill: input.resolvedSkill,
    skills: input.skills,
    mode,
    requestedSkillIds: input.request?.skillIds,
    content: input.content,
  });
  return {
    status: "ok",
    agent: packet.agent,
    skill: packet.skill,
    ...(mode === "skills" || mode === "all" ? { skills: packet.skills, resolution: packet.resolution } : {}),
    content: packet.content,
    mediaType: packet.mediaType,
  };
};

export const createSkillPacket = (input: {
  agent: SkillPacket["agent"];
  skill: AgentSkillContract;
  skills: SaySoSkillDocument[];
  mode?: "resolved" | "skills" | "all";
  requestedSkillIds?: string[];
  content: string;
}): SkillPacket => ({
  agent: input.agent,
  skill: input.skill,
  skills: input.skills,
  resolution: {
    mode: input.mode ?? "all",
    ...(input.requestedSkillIds ? { requestedSkillIds: input.requestedSkillIds } : {}),
    includedSkillIds: input.skills.map((skill) => skill.skillId),
    dependencyOrder: input.skills.map((skill) => skill.skillId),
  },
  content: input.content,
  mediaType: "text/markdown",
});
