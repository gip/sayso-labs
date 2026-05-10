import type {
  ConfigurationRequestPayload,
  ConnectionRequestPayload,
  ForkOffersRequestPayload,
  ForkRequestPayload,
  SourceChunkRequestPayload,
  SourceManifestRequestPayload,
  SkillRequestPayload,
} from "./types.js";

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isEmptyObject = (value: unknown): value is Record<string, never> =>
  isRecord(value) && Object.keys(value).length === 0;

export const isClaimPresentation = (value: unknown) =>
  isRecord(value) &&
  typeof value.type === "string" &&
  value.type.length > 0 &&
  isRecord(value.payload);

const isStringArray = (value: unknown) =>
  Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);

const isRelativeSourcePath = (value: unknown) =>
  typeof value === "string" && value.length > 0 && !value.startsWith("/") && !value.includes("//") && !value.split("/").includes("..");

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
  if (
    include !== undefined &&
    include !== "resolved" &&
    include !== "skills" &&
    include !== "all"
  ) {
    return null;
  }
  if (
    value.skillIds !== undefined &&
    (!Array.isArray(value.skillIds) || value.skillIds.some((item) => typeof item !== "string"))
  ) {
    return null;
  }
  if (
    value.maxDepth !== undefined &&
    (!Number.isInteger(value.maxDepth) || Number(value.maxDepth) < 0)
  ) {
    return null;
  }
  return value as SkillRequestPayload;
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
