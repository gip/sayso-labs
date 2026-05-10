import type {
  ConfigurationRequestPayload,
  AgentGetPayload,
  AgentQueryPayload,
  ConnectionRequestPayload,
  ForkOffersRequestPayload,
  ForkRequestPayload,
  SourceChunkRequestPayload,
  SourceManifestRequestPayload,
  PaymentSubmitPayload,
  PremiumRegistrationSubmitPayload,
  RegistrationRemovePayload,
  RegistrationSubmitPayload,
  SkillRequestPayload,
} from "./types.js";

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isClaimPresentation = (value: unknown) =>
  isRecord(value) && typeof value.type === "string" && value.type.length > 0 && isRecord(value.payload);

export const isConnectionRequest = (value: unknown): value is ConnectionRequestPayload => {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 0) return true;
  if (keys.some((key) => key !== "presentations")) return false;
  if (value.presentations === undefined) return true;
  return Array.isArray(value.presentations) && value.presentations.every(isClaimPresentation);
};

export const parseSkillRequest = (value: unknown): SkillRequestPayload | null => {
  if (!isRecord(value)) return null;
  const include = value.include;
  if (include !== undefined && include !== "resolved" && include !== "skills" && include !== "all") return null;
  if (value.skillIds !== undefined && (!Array.isArray(value.skillIds) || value.skillIds.some((item) => typeof item !== "string"))) {
    return null;
  }
  if (value.maxDepth !== undefined && (!Number.isInteger(value.maxDepth) || Number(value.maxDepth) < 0)) return null;
  return value as SkillRequestPayload;
};

const isStringArray = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
const premiumAgentIdPattern = /^(?!0x)[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;
const isRelativeSourcePath = (value: unknown) =>
  typeof value === "string" && value.length > 0 && !value.startsWith("/") && !value.includes("//") && !value.split("/").includes("..");

export const parseRegistrationSubmit = (value: unknown): RegistrationSubmitPayload | null => {
  if (!isRecord(value) || typeof value.requestId !== "string" || !isRecord(value.agent)) return null;
  if (value.visibility !== "private" && value.visibility !== "public") return null;
  const agent = value.agent;
  if (
    typeof agent.agentId !== "string" ||
    typeof agent.syncInboxId !== "string" ||
    typeof agent.displayName !== "string" ||
    typeof agent.protocolVersion !== "string"
  ) {
    return null;
  }
  if (value.profile !== undefined) {
    if (!isRecord(value.profile)) return null;
    if (value.profile.skillDisclosure !== "summary-only" && value.profile.skillDisclosure !== "include-skill-packet") return null;
    if (value.profile.description !== undefined && typeof value.profile.description !== "string") return null;
    if (value.profile.skillDisclosure === "include-skill-packet" && !isRecord(value.profile.skillPacket)) return null;
    if (value.profile.skillDisclosure === "summary-only" && value.profile.skillPacket !== undefined) return null;
  }
  if (value.visibility === "public" && (value.profile === undefined || typeof value.profile.description !== "string" || value.profile.description.length === 0)) {
    return null;
  }
  if (value.expiresAt !== undefined && typeof value.expiresAt !== "string") return null;
  if (value.extensions !== undefined && !isRecord(value.extensions)) return null;
  return value as RegistrationSubmitPayload;
};

export const parsePremiumRegistrationSubmit = (value: unknown): PremiumRegistrationSubmitPayload | null => {
  const parsed = parseRegistrationSubmit(value);
  if (!parsed || parsed.visibility !== "public" || parsed.expiresAt !== undefined || !parsed.profile) return null;
  if (!premiumAgentIdPattern.test(parsed.agent.agentId)) return null;
  if (typeof parsed.profile.description !== "string" || parsed.profile.description.length === 0) return null;
  return parsed as PremiumRegistrationSubmitPayload;
};

export const parseRegistrationRemove = (value: unknown): RegistrationRemovePayload | null => {
  if (!isRecord(value) || typeof value.requestId !== "string") return null;
  if (value.agentId !== undefined && typeof value.agentId !== "string") return null;
  if (value.syncInboxId !== undefined && typeof value.syncInboxId !== "string") return null;
  return value as RegistrationRemovePayload;
};

export const parseAgentQuery = (value: unknown): AgentQueryPayload | null => {
  if (!isRecord(value) || typeof value.requestId !== "string") return null;
  if (value.query !== undefined && typeof value.query !== "string") return null;
  if (value.skillIds !== undefined && !isStringArray(value.skillIds)) return null;
  if (value.capabilityIds !== undefined && !isStringArray(value.capabilityIds)) return null;
  if (value.limit !== undefined && (!Number.isInteger(value.limit) || Number(value.limit) < 1)) return null;
  if (value.cursor !== undefined && typeof value.cursor !== "string") return null;
  return value as AgentQueryPayload;
};

export const parseAgentGet = (value: unknown): AgentGetPayload | null => {
  if (!isRecord(value) || typeof value.requestId !== "string") return null;
  if (value.agentId !== undefined && typeof value.agentId !== "string") return null;
  if (value.syncInboxId !== undefined && typeof value.syncInboxId !== "string") return null;
  return value as AgentGetPayload;
};

export const parsePaymentSubmit = (value: unknown): PaymentSubmitPayload | null => {
  if (!isRecord(value) || typeof value.requestId !== "string" || !isRecord(value.payment)) return null;
  const payment = value.payment;
  if (!Number.isInteger(payment.x402Version) || !isRecord(payment.accepted) || !isRecord(payment.payload)) return null;
  if (payment.resource !== undefined && !isRecord(payment.resource)) return null;
  if (payment.extensions !== undefined && !isRecord(payment.extensions)) return null;
  return value as PaymentSubmitPayload;
};

export const parseConfigurationRequest = (value: unknown): ConfigurationRequestPayload | null => {
  if (!isRecord(value) || typeof value.requestId !== "string") return null;
  if (value.names !== undefined && !isStringArray(value.names)) return null;
  if (value.includeValues !== undefined && value.includeValues !== "public" && value.includeValues !== "none") return null;
  return value as ConfigurationRequestPayload;
};

export const parseSourceManifestRequest = (value: unknown): SourceManifestRequestPayload | null => {
  if (!isRecord(value) || typeof value.requestId !== "string") return null;
  if (value.format !== undefined && value.format !== "files" && value.format !== "tar.gz" && value.format !== "zip") return null;
  if (value.include !== undefined && !isStringArray(value.include)) return null;
  if (value.exclude !== undefined && !isStringArray(value.exclude)) return null;
  if (value.maxChunkSizeBytes !== undefined && (!Number.isInteger(value.maxChunkSizeBytes) || Number(value.maxChunkSizeBytes) < 1)) return null;
  return value as SourceManifestRequestPayload;
};

export const parseSourceChunkRequest = (value: unknown): SourceChunkRequestPayload | null => {
  if (!isRecord(value) || typeof value.requestId !== "string" || typeof value.snapshotId !== "string") return null;
  if (!Number.isInteger(value.chunkIndex) || Number(value.chunkIndex) < 0) return null;
  if (!isRecord(value.target)) return null;
  if (value.target.kind === "file" && isRelativeSourcePath(value.target.path)) return value as SourceChunkRequestPayload;
  if (value.target.kind === "archive" && (value.target.format === "tar.gz" || value.target.format === "zip")) return value as SourceChunkRequestPayload;
  return null;
};

export const parseForkOffersRequest = (value: unknown): ForkOffersRequestPayload | null => {
  if (!isRecord(value) || typeof value.requestId !== "string") return null;
  if (value.requestedDurationSeconds !== undefined && (!Number.isInteger(value.requestedDurationSeconds) || Number(value.requestedDurationSeconds) < 1)) return null;
  if (value.includePaymentRequirements !== undefined && typeof value.includePaymentRequirements !== "boolean") return null;
  return value as ForkOffersRequestPayload;
};

export const parseForkRequest = (value: unknown): ForkRequestPayload | null => {
  if (!isRecord(value) || typeof value.requestId !== "string" || typeof value.offerId !== "string") return null;
  if (
    value.configuration !== undefined &&
    (!Array.isArray(value.configuration) ||
      value.configuration.some((item) => !isRecord(item) || typeof item.name !== "string" || !Object.prototype.hasOwnProperty.call(item, "value")))
  ) {
    return null;
  }
  if (value.requester !== undefined && !isRecord(value.requester)) return null;
  if (value.extensions !== undefined && !isRecord(value.extensions)) return null;
  return value as ForkRequestPayload;
};
