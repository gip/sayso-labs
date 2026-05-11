// Browser-safe entry. Excludes modules that require Node-only APIs:
//   - schemaExtractor.js / payloadValidation.js (node:fs, node:path)
//   - validation.js (re-exports payloadValidation)
//   - networkSkill.js (reads SKILL.md from disk)
// Browser consumers can still construct and inspect payload shapes; runtime
// schema validation is only available in Node hosts that can load SKILL.md.
export * from "./codecs.js";
export * from "./constants.js";
export * from "./contentTypes.js";
export * from "./predicates.js";
export * from "./protocol.js";
export * from "./types.js";
export * from "./worldIdentity.js";
