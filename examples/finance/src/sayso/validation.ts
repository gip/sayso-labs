import type {
  ConfigurationRequestPayload,
  ConnectionRequestPayload,
  SkillRequestPayload,
} from "./types.js";

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isClaimPresentation = (value: unknown) =>
  isRecord(value) &&
  typeof value.type === "string" &&
  value.type.length > 0 &&
  isRecord(value.payload);

const isStringArray = (value: unknown) =>
  Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);

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
  if (!isRecord(value) || typeof value.requestId !== "string" || value.requestId.length === 0) return null;
  if (value.names !== undefined && !isStringArray(value.names)) return null;
  if (value.includeValues !== undefined && value.includeValues !== "public" && value.includeValues !== "none") return null;
  return value as ConfigurationRequestPayload;
};
