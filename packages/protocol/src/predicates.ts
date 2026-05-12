// Browser-safe type predicates. Must not import from validation.js or
// payloadValidation.js — those pull in Node-only schema loading.
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
