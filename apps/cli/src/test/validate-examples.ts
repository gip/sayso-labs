import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadSkillSchemaCatalog, schemaContentTypeKey } from "../sayso/schemaExtractor.js";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Schema = Record<string, unknown>;

const root = path.resolve(process.cwd(), "../..");
const exampleDir = path.join(root, "examples");
const payloadDir = path.join(exampleDir, "payloads");
const schemaCatalog = loadSkillSchemaCatalog({ root });
const schemas = Object.fromEntries(schemaCatalog.schemas.map((entry) => [entry.id, entry.schema]));

const resolveRef = (ref: string, currentFile: string): { schema: Schema; file: string } => {
  const [schemaId, fragment = ""] = ref.split("#");
  const file = schemaId || currentFile;
  let schema: unknown = schemas[file];
  if (!schema) throw new Error(`Unknown schema ref ${ref} from ${currentFile}`);
  if (fragment) {
    for (const part of fragment
      .replace(/^\//, "")
      .split("/")
      .filter(Boolean)
      .map((item) => item.replace(/~1/g, "/").replace(/~0/g, "~"))) {
      schema = (schema as Record<string, unknown>)[part];
    }
  }
  return { schema: schema as Schema, file };
};

const isType = (value: unknown, type: string) => {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return typeof value === "object" && value !== null && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  return typeof value === type;
};

const validate = (schema: Schema, value: unknown, location: string, file: string): string[] => {
  const errors: string[] = [];
  if (typeof schema.$ref === "string") {
    const resolved = resolveRef(schema.$ref, file);
    return validate(resolved.schema, value, location, resolved.file);
  }
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf
      .map((candidate) => validate(candidate as Schema, value, location, file))
      .filter((result) => result.length === 0);
    return matches.length === 1
      ? []
      : [`${location}: expected exactly one matching oneOf branch, got ${matches.length}`];
  }
  if (Object.prototype.hasOwnProperty.call(schema, "const") && value !== schema.const) {
    errors.push(`${location}: expected const ${JSON.stringify(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))) {
    errors.push(`${location}: expected one of ${schema.enum.map((item) => JSON.stringify(item)).join(", ")}`);
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => isType(value, String(type)))) {
      errors.push(`${location}: expected type ${types.join(" or ")}`);
      return errors;
    }
  }
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${location}: below minLength ${schema.minLength}`);
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${location}: does not match pattern ${schema.pattern}`);
    }
  }
  if (typeof value === "number" && typeof schema.minimum === "number" && value < schema.minimum) {
    errors.push(`${location}: below minimum ${schema.minimum}`);
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`${location}: below minItems ${schema.minItems}`);
    }
    if (schema.uniqueItems) {
      const seen = new Set(value.map((item) => JSON.stringify(item)));
      if (seen.size !== value.length) errors.push(`${location}: duplicate array items`);
    }
    if (schema.items) {
      value.forEach((item, index) =>
        errors.push(...validate(schema.items as Schema, item, `${location}[${index}]`, file)),
      );
    }
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const required of (schema.required as string[] | undefined) ?? []) {
      if (!Object.prototype.hasOwnProperty.call(record, required)) {
        errors.push(`${location}: missing required property ${required}`);
      }
    }
    const properties = (schema.properties as Record<string, Schema> | undefined) ?? {};
    for (const [key, item] of Object.entries(record)) {
      if (properties[key]) errors.push(...validate(properties[key], item, `${location}.${key}`, file));
      else if (schema.additionalProperties === false) errors.push(`${location}: unexpected property ${key}`);
      else if (typeof schema.additionalProperties === "object") {
        errors.push(...validate(schema.additionalProperties as Schema, item, `${location}.${key}`, file));
      }
    }
  }
  return errors;
};

const pairs: Record<string, string> = {
  "payloads/protocol/agent-info.json": "sayso://sayso.protocol/agent-info/1",
  "payloads/protocol/connection-request.json": "sayso://sayso.protocol/connection-request/1",
  "payloads/protocol/connection-request-world-id.json": "sayso://sayso.protocol/connection-request/1",
  "payloads/protocol/connection-response.json": "sayso://sayso.protocol/connection-response/1",
  "payloads/protocol/connection-response-presentation-error.json": "sayso://sayso.protocol/connection-response/1",
  "payloads/protocol/skill-request.json": "sayso://sayso.protocol/skill-request/1",
  "payloads/protocol/skill-request-all.json": "sayso://sayso.protocol/skill-request/1",
  "flows/skill-response.json": "sayso://sayso.protocol/skill-response/1",
  "flows/composed-skill-response.json": "sayso://sayso.protocol/skill-response/1",
  "flows/pong-skill-response.json": "sayso://sayso.protocol/skill-response/1",
  "flows/world-claim-skill-response.json": "sayso://sayso.protocol/skill-response/1",
  "flows/reference-implementations-skill-bundle-response.json": "sayso://sayso.protocol/skill-response/1",
  "payloads/payment/payment-required.json": "sayso://sayso.payment/payment-required/1",
  "payloads/payment/payment-submit.json": "sayso://sayso.payment/payment-submit/1",
  "payloads/payment/payment-result.json": "sayso://sayso.payment/payment-result/1",
  "payloads/payment/premium-registration-payment-required.json": "sayso://sayso.payment/payment-required/1",
  "payloads/payment/premium-registration-payment-submit.json": "sayso://sayso.payment/payment-submit/1",
  "payloads/payment/premium-registration-payment-result.json": "sayso://sayso.payment/payment-result/1",
  "payloads/payment/fork-payment-required.json": "sayso://sayso.payment/payment-required/1",
  "payloads/payment/fork-payment-submit.json": "sayso://sayso.payment/payment-submit/1",
  "payloads/payment/fork-payment-result.json": "sayso://sayso.payment/payment-result/1",
  "payloads/configure/configuration-request.json": "sayso://sayso.configure/configuration-request/1",
  "payloads/configure/configuration-response.json": "sayso://sayso.configure/configuration-response/1",
  "payloads/source/source-manifest-request.json": "sayso://sayso.source/source-manifest-request/1",
  "payloads/source/source-manifest-response.json": "sayso://sayso.source/source-manifest-response/1",
  "payloads/source/source-chunk-request.json": "sayso://sayso.source/source-chunk-request/1",
  "payloads/source/source-chunk-response.json": "sayso://sayso.source/source-chunk-response/1",
  "payloads/fork/fork-offers-request.json": "sayso://sayso.fork/fork-offers-request/1",
  "payloads/fork/fork-offers-response.json": "sayso://sayso.fork/fork-offers-response/1",
  "payloads/fork/fork-request-free.json": "sayso://sayso.fork/fork-request/1",
  "payloads/fork/fork-request-paid.json": "sayso://sayso.fork/fork-request/1",
  "payloads/fork/fork-result-free.json": "sayso://sayso.fork/fork-result/1",
  "payloads/fork/fork-result-paid.json": "sayso://sayso.fork/fork-result/1",
  "payloads/network/registration-submit-private.json": "sayso://sayso.network/registration-submit/1",
  "payloads/network/registration-submit-public-summary.json": "sayso://sayso.network/registration-submit/1",
  "payloads/network/registration-submit-public-skill-packet.json": "sayso://sayso.network/registration-submit/1",
  "payloads/network/premium-registration-submit-public-summary.json":
    "sayso://sayso.network/premium-registration-submit/1",
  "payloads/network/registration-result-accepted.json": "sayso://sayso.network/registration-result/1",
  "payloads/network/premium-registration-result-accepted.json": "sayso://sayso.network/registration-result/1",
  "payloads/network/registration-result-rejected-sender-mismatch.json":
    "sayso://sayso.network/registration-result/1",
  "payloads/network/registration-remove.json": "sayso://sayso.network/registration-remove/1",
  "payloads/network/agent-query.json": "sayso://sayso.network/agent-query/1",
  "payloads/network/agent-query-response.json": "sayso://sayso.network/agent-query-response/1",
  "payloads/network/agent-get.json": "sayso://sayso.network/agent-get/1",
  "payloads/network/agent-get-response-found.json": "sayso://sayso.network/agent-get-response/1",
  "payloads/network/agent-get-response-not-found.json": "sayso://sayso.network/agent-get-response/1",
  "payloads/protocol/disconnect.json": "sayso://sayso.protocol/disconnect/1",
  "payloads/protocol/forget-me.json": "sayso://sayso.protocol/forget-me/1",
  "payloads/protocol/disconnect-ack.json": "sayso://sayso.protocol/disconnect-ack/1",
  "payloads/protocol/protocol-error.json": "sayso://sayso.protocol/error/1",
  "payloads/pong/ping-request.json": "sayso://sayso.demo.pong/ping-request/1",
  "payloads/pong/pong-response.json": "sayso://sayso.demo.pong/pong-response/1",
  "payloads/claim/world-id-wallet-presentation.json": "sayso://sayso.claim/world-id.wallet",
  "payloads/claim/wallet-control-presentation.json": "sayso://sayso.claim/wallet-control",
  "payloads/claim/agent-connection-presentation.json":
    "sayso://sayso.claim/agent-connection",
  "payloads/identity/agent-roster-presentation.json":
    "sayso://sayso.identity/agent-roster",
  "payloads/identity/wallet-control-presentation.json":
    "sayso://sayso.claim/wallet-control",
  "payloads/reference-implementations/implementation-list-request.json":
    "sayso://sayso.reference-implementations/implementation-list-request/1",
  "payloads/reference-implementations/implementation-list-response.json":
    "sayso://sayso.reference-implementations/implementation-list-response/1",
  "payloads/reference-implementations/implementation-request.json":
    "sayso://sayso.reference-implementations/implementation-request/1",
  "payloads/reference-implementations/implementation-response.json":
    "sayso://sayso.reference-implementations/implementation-response/1",
  "payloads/upgrade/upgrade-proposal-add-payment.json": "sayso://sayso.upgrade/upgrade-proposal/1",
  "payloads/upgrade/upgrade-proposal-replace-protocol.json": "sayso://sayso.upgrade/upgrade-proposal/1",
  "payloads/upgrade/upgrade-proposal-remove-extension.json": "sayso://sayso.upgrade/upgrade-proposal/1",
  "payloads/upgrade/upgrade-proposal-protocol-handoff.json": "sayso://sayso.upgrade/upgrade-proposal/1",
  "payloads/upgrade/upgrade-accept.json": "sayso://sayso.upgrade/upgrade-accept/1",
  "payloads/upgrade/upgrade-reject.json": "sayso://sayso.upgrade/upgrade-reject/1",
  "payloads/upgrade/upgrade-reject-handoff.json": "sayso://sayso.upgrade/upgrade-reject/1",
};

type UpgradeProposal = {
  proposalId: string;
  targetMode: "sayso-bundle" | "protocol-handoff";
  baseSkillIds: string[];
  skillChanges: Array<{
    skillId: string;
    operation: "keep" | "replace" | "add" | "remove";
    fromVersion?: string;
    toVersion?: string;
  }>;
  targetSkills?: Array<{
    skillId: string;
    version: string;
    imports: Array<{ skillId: string }>;
  }>;
  handoffProtocol?: {
    protocolId?: string;
    version?: string;
    transport?: string;
    entryContentTypes?: string[];
  };
  targetResolution?: {
    includedSkillIds: string[];
    dependencyOrder: string[];
  };
};

type NetworkRegistrationSubmit = {
  requestId: string;
  visibility: "private" | "public";
  profile?: {
    description?: string;
    skillDisclosure?: "summary-only" | "include-skill-packet";
    skillPacket?: unknown;
  };
};

type NetworkQueryResponse = {
  results: Array<{
    visibility: "private" | "public";
    skillDisclosure: "summary-only" | "include-skill-packet";
    skillPacket?: unknown;
  }>;
};

type ConfigurationResponse = {
  status: "ok" | "error";
  variables?: Array<{
    name: string;
    visibility: "public" | "private";
    value?: unknown;
  }>;
};

type SourceManifestResponse = {
  status: "ok" | "error";
  files?: Array<{
    path: string;
    chunks: number;
  }>;
  archives?: Array<{
    format: "tar.gz" | "zip";
    chunks: number;
  }>;
};

type ForkOffersResponse = {
  status: "ok" | "error";
  offers?: Array<{
    offerId: string;
    durationSeconds: number;
    requiredConfiguration: string[];
    payment?: {
      required: boolean;
      accepts?: unknown[];
    };
  }>;
};

type WorldIdWalletPresentation = {
  type: "sayso.claim.world-id.wallet";
  payload: {
    wallet?: {
      type?: string;
      address?: string;
    };
    version?: string;
    proofType?: string;
    rpId?: string;
    action?: string;
    idkitResponse?: unknown;
  };
};

type AgentConnectionPresentation = {
  type: "sayso.claim.agent-connection";
  payload: {
    message: {
      claim?: string;
      requester?: {
        type?: string;
        address?: string;
      };
      agent?: {
        type?: string;
        address?: string;
      };
      timestamp?: string;
    };
    signatures?: Array<{
      type?: string;
      address?: string;
      signatureScheme?: string;
      signature?: string;
    }>;
  };
};

const setEquals = (left: string[], right: string[]) =>
  left.length === right.length && left.every((item) => right.includes(item));

const validateUpgradeProposalSemantics = (proposal: UpgradeProposal, name: string): string[] => {
  const result: string[] = [];
  const targetSkills = proposal.targetSkills ?? [];
  const targetIds = targetSkills.map((skill) => skill.skillId);
  const targetIdSet = new Set(targetIds);
  const changeIds = proposal.skillChanges.map((change) => change.skillId);
  const changeIdSet = new Set(changeIds);

  if (changeIdSet.size !== changeIds.length) result.push(`${name}: duplicate skillChanges skill ids`);

  if (proposal.targetMode === "protocol-handoff") {
    if (targetSkills.length > 0) result.push(`${name}: protocol-handoff targetSkills must be omitted or empty`);
    if (!proposal.handoffProtocol) result.push(`${name}: protocol-handoff requires handoffProtocol`);
    else {
      if (!proposal.handoffProtocol.protocolId) result.push(`${name}: handoffProtocol.protocolId is required`);
      if (!proposal.handoffProtocol.version) result.push(`${name}: handoffProtocol.version is required`);
      if (!proposal.handoffProtocol.transport) result.push(`${name}: handoffProtocol.transport is required`);
      if (!proposal.handoffProtocol.entryContentTypes?.length) {
        result.push(`${name}: handoffProtocol.entryContentTypes is required`);
      }
    }
    if (proposal.targetResolution) result.push(`${name}: protocol-handoff must not include targetResolution`);
    for (const change of proposal.skillChanges) {
      if (!proposal.baseSkillIds.includes(change.skillId)) {
        result.push(`${name}: handoff change ${change.skillId} must appear in baseSkillIds`);
      }
    }
    return result;
  }

  if (proposal.targetMode !== "sayso-bundle") result.push(`${name}: unknown targetMode`);
  if (targetIdSet.size !== targetIds.length) result.push(`${name}: duplicate target skill ids`);
  if (!targetIdSet.has("sayso.protocol")) result.push(`${name}: targetSkills must include sayso.protocol`);
  if (proposal.handoffProtocol) result.push(`${name}: sayso-bundle must not include handoffProtocol`);

  for (const change of proposal.skillChanges) {
    const target = targetSkills.find((skill) => skill.skillId === change.skillId);
    if (change.operation === "remove") {
      if (target) result.push(`${name}: removed skill ${change.skillId} must not appear in targetSkills`);
      if (!proposal.baseSkillIds.includes(change.skillId)) {
        result.push(`${name}: removed skill ${change.skillId} must appear in baseSkillIds`);
      }
      continue;
    }

    if (!target) result.push(`${name}: ${change.operation} skill ${change.skillId} must appear in targetSkills`);
    if (change.operation !== "add" && !proposal.baseSkillIds.includes(change.skillId)) {
      result.push(`${name}: ${change.operation} skill ${change.skillId} must appear in baseSkillIds`);
    }
    if (change.operation === "add" && proposal.baseSkillIds.includes(change.skillId)) {
      result.push(`${name}: added skill ${change.skillId} must not appear in baseSkillIds`);
    }
    if (target && change.toVersion && target.version !== change.toVersion) {
      result.push(`${name}: ${change.skillId} target version must match toVersion`);
    }
    if (target && change.operation === "keep" && change.fromVersion && target.version !== change.fromVersion) {
      result.push(`${name}: kept skill ${change.skillId} target version must match fromVersion`);
    }
    if (change.operation === "replace" && change.fromVersion && change.toVersion && change.fromVersion === change.toVersion) {
      result.push(`${name}: replaced skill ${change.skillId} must change version`);
    }
  }

  for (const target of targetSkills) {
    for (const imported of target.imports ?? []) {
      if (!targetIdSet.has(imported.skillId)) {
        result.push(`${name}: unresolved import ${target.skillId} -> ${imported.skillId}`);
      }
    }
  }

  if (proposal.targetResolution) {
    if (!setEquals(proposal.targetResolution.includedSkillIds, targetIds)) {
      result.push(`${name}: targetResolution.includedSkillIds must match targetSkills`);
    }
    if (!setEquals(proposal.targetResolution.dependencyOrder, targetIds)) {
      result.push(`${name}: targetResolution.dependencyOrder must match targetSkills`);
    }
  }

  return result;
};

const collectSchemaRefs = (schema: unknown, refs: string[] = []): string[] => {
  if (Array.isArray(schema)) {
    for (const item of schema) collectSchemaRefs(item, refs);
    return refs;
  }
  if (typeof schema !== "object" || schema === null) return refs;
  const record = schema as Record<string, unknown>;
  if (typeof record.$ref === "string") refs.push(record.$ref);
  for (const value of Object.values(record)) collectSchemaRefs(value, refs);
  return refs;
};

const errors: string[] = [];
for (const schema of schemaCatalog.schemas) {
  for (const ref of collectSchemaRefs(schema.schema)) {
    try {
      resolveRef(ref, schema.id);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Unable to resolve schema ref ${ref}`);
    }
  }
}

for (const schemaName of new Set(Object.values(pairs))) {
  const schema = schemas[schemaName];
  if (!schema) {
    errors.push(`missing schema ${schemaName}`);
    continue;
  }
  const contentType = schema["x-sayso-content-type"];
  if (typeof contentType === "object" && contentType !== null && !Array.isArray(contentType)) {
    const key = schemaContentTypeKey(contentType as { authorityId: string; typeId: string; versionMajor: number });
    if (!schemaCatalog.contentTypeSchemas.has(key)) errors.push(`missing content type index for ${schemaName}`);
  }
}

for (const [exampleName, schemaName] of Object.entries(pairs)) {
  const data = JSON.parse(readFileSync(path.join(exampleDir, exampleName), "utf8")) as Json;
  errors.push(...validate(schemas[schemaName], data, exampleName, schemaName));
}

if (
  validate(
    schemas["sayso://sayso.protocol/connection-request/1"],
    { identities: [{ type: "sayso.example", payload: {} }] },
    "protocol/connection-request-identities",
    "sayso://sayso.protocol/connection-request/1",
  ).length === 0
) {
  errors.push("protocol/connection-request-identities: expected schema rejection");
}

const configurationResponse = JSON.parse(
  readFileSync(path.join(payloadDir, "configure/configuration-response.json"), "utf8"),
) as ConfigurationResponse;
if (configurationResponse.status === "ok") {
  for (const variable of configurationResponse.variables ?? []) {
    if (variable.visibility === "private" && Object.prototype.hasOwnProperty.call(variable, "value")) {
      errors.push(`configure/configuration-response.json: private variable ${variable.name} exposes value`);
    }
  }
}

const invalidPrivateConfiguration = JSON.parse(JSON.stringify(configurationResponse)) as ConfigurationResponse;
if (invalidPrivateConfiguration.status === "ok" && invalidPrivateConfiguration.variables?.[1]) {
  invalidPrivateConfiguration.variables[1].value = "must-not-be-present";
}
if (
  validate(
    schemas["sayso://sayso.configure/configuration-response/1"],
    invalidPrivateConfiguration,
    "configure/invalid-private-value",
    "sayso://sayso.configure/configuration-response/1",
  ).length === 0
) {
  errors.push("configure/invalid-private-value: expected schema rejection");
}

const sourceManifestResponse = JSON.parse(
  readFileSync(path.join(payloadDir, "source/source-manifest-response.json"), "utf8"),
) as SourceManifestResponse;
if (sourceManifestResponse.status === "ok") {
  for (const file of sourceManifestResponse.files ?? []) {
    if (file.path.startsWith("/") || file.path.split("/").includes("..")) {
      errors.push(`source/source-manifest-response.json: invalid relative path ${file.path}`);
    }
    if (file.chunks < 1) errors.push(`source/source-manifest-response.json: ${file.path} has no chunks`);
  }
  for (const archive of sourceManifestResponse.archives ?? []) {
    if (archive.chunks < 1) errors.push(`source/source-manifest-response.json: archive ${archive.format} has no chunks`);
  }
}

const invalidSourceChunkRequest = JSON.parse(
  readFileSync(path.join(payloadDir, "source/source-chunk-request.json"), "utf8"),
) as Json;
if (typeof invalidSourceChunkRequest === "object" && invalidSourceChunkRequest && !Array.isArray(invalidSourceChunkRequest)) {
  const target = invalidSourceChunkRequest.target as Record<string, unknown>;
  target.path = "../secret.env";
}
if (
  validate(
    schemas["sayso://sayso.source/source-chunk-request/1"],
    invalidSourceChunkRequest,
    "source/invalid-parent-path",
    "sayso://sayso.source/source-chunk-request/1",
  ).length === 0
) {
  errors.push("source/invalid-parent-path: expected schema rejection");
}

const forkOffersResponse = JSON.parse(
  readFileSync(path.join(payloadDir, "fork/fork-offers-response.json"), "utf8"),
) as ForkOffersResponse;
if (forkOffersResponse.status === "ok") {
  const freeOffer = forkOffersResponse.offers?.find((offer) => offer.payment?.required === false);
  const paidOffer = forkOffersResponse.offers?.find((offer) => offer.payment?.required === true);
  if (!freeOffer) errors.push("fork/fork-offers-response.json: expected a free fork offer");
  if (!paidOffer) errors.push("fork/fork-offers-response.json: expected a paid fork offer");
  if (paidOffer && (!paidOffer.payment?.accepts || paidOffer.payment.accepts.length === 0)) {
    errors.push("fork/fork-offers-response.json: paid fork offer must include payment requirements");
  }
}

const validWorldIdWalletPresentation = JSON.parse(
  readFileSync(path.join(payloadDir, "claim/world-id-wallet-presentation.json"), "utf8"),
) as WorldIdWalletPresentation;

const expectInvalidWorldIdWalletPresentation = (name: string, mutate: (presentation: WorldIdWalletPresentation) => void) => {
  const presentation = JSON.parse(JSON.stringify(validWorldIdWalletPresentation)) as WorldIdWalletPresentation;
  mutate(presentation);
  const result = validate(
    schemas["sayso://sayso.claim/world-id.wallet"],
    presentation,
    name,
    "sayso://sayso.claim/world-id.wallet",
  );
  if (result.length === 0) errors.push(`${name}: expected invalid World ID wallet claim presentation`);
};

expectInvalidWorldIdWalletPresentation("claim/world-id/invalid-type", (presentation) => {
  presentation.type = "sayso.other" as "sayso.claim.world-id.wallet";
});

expectInvalidWorldIdWalletPresentation("claim/world-id/invalid-wallet", (presentation) => {
  delete presentation.payload.wallet;
});

expectInvalidWorldIdWalletPresentation("claim/world-id/invalid-version", (presentation) => {
  presentation.payload.version = "world-id-3";
});

expectInvalidWorldIdWalletPresentation("claim/world-id/invalid-proof-type", (presentation) => {
  presentation.payload.proofType = "session";
});

expectInvalidWorldIdWalletPresentation("claim/world-id/invalid-action", (presentation) => {
  presentation.payload.action = "other";
});

expectInvalidWorldIdWalletPresentation("claim/world-id/missing-idkit-response", (presentation) => {
  delete presentation.payload.idkitResponse;
});

const validAgentConnectionPresentation = JSON.parse(
  readFileSync(path.join(payloadDir, "claim/agent-connection-presentation.json"), "utf8"),
) as AgentConnectionPresentation;

const expectInvalidAgentConnectionPresentation = (
  name: string,
  mutate: (presentation: AgentConnectionPresentation) => void,
) => {
  const presentation = JSON.parse(JSON.stringify(validAgentConnectionPresentation)) as AgentConnectionPresentation;
  mutate(presentation);
  const result = validate(
    schemas["sayso://sayso.claim/agent-connection"],
    presentation,
    name,
    "sayso://sayso.claim/agent-connection",
  );
  if (result.length === 0) errors.push(`${name}: expected invalid agent connection claim presentation`);
};

expectInvalidAgentConnectionPresentation("claim/agent-connection/invalid-type", (presentation) => {
  presentation.type = "sayso.other" as "sayso.claim.agent-connection";
});

expectInvalidAgentConnectionPresentation("claim/agent-connection/missing-requester", (presentation) => {
  delete presentation.payload.message.requester;
});

expectInvalidAgentConnectionPresentation("claim/agent-connection/missing-agent", (presentation) => {
  delete presentation.payload.message.agent;
});

expectInvalidAgentConnectionPresentation("claim/agent-connection/missing-signature", (presentation) => {
  delete presentation.payload.signatures;
});

const validateNetworkRegistrationSemantics = (registration: NetworkRegistrationSubmit, name: string) => {
  const result: string[] = [];
  if (registration.visibility === "public" && !registration.profile?.description) {
    result.push(`${name}: public registration requires profile.description`);
  }
  if (registration.profile?.skillDisclosure === "summary-only" && registration.profile.skillPacket) {
    result.push(`${name}: summary-only registration must not include skillPacket`);
  }
  if (registration.profile?.skillDisclosure === "include-skill-packet" && !registration.profile.skillPacket) {
    result.push(`${name}: include-skill-packet registration requires skillPacket`);
  }
  return result;
};

for (const exampleName of [
  "network/registration-submit-private.json",
  "network/registration-submit-public-summary.json",
  "network/registration-submit-public-skill-packet.json",
  "network/premium-registration-submit-public-summary.json",
]) {
  const data = JSON.parse(readFileSync(path.join(payloadDir, exampleName), "utf8")) as NetworkRegistrationSubmit;
  errors.push(...validateNetworkRegistrationSemantics(data, exampleName));
}

for (const exampleName of [
  "network/premium-registration-submit-private.invalid.json",
  "network/premium-registration-submit-invalid-name.invalid.json",
  "network/premium-registration-submit-missing-profile.invalid.json",
]) {
  const data = JSON.parse(readFileSync(path.join(payloadDir, exampleName), "utf8")) as NetworkRegistrationSubmit;
  if (
    validate(
      schemas["sayso://sayso.network/premium-registration-submit/1"],
      data,
      exampleName,
      "sayso://sayso.network/premium-registration-submit/1",
    ).length === 0
  ) {
    errors.push(`${exampleName}: expected schema rejection`);
  }
}

const validPublicSummaryRegistration = JSON.parse(
  readFileSync(path.join(payloadDir, "network/registration-submit-public-summary.json"), "utf8"),
) as NetworkRegistrationSubmit;

const invalidMissingDescription = JSON.parse(JSON.stringify(validPublicSummaryRegistration)) as NetworkRegistrationSubmit;
if (invalidMissingDescription.profile) delete invalidMissingDescription.profile.description;
if (
  validate(
    schemas["sayso://sayso.network/registration-submit/1"],
    invalidMissingDescription,
    "network/invalid-public-description",
    "sayso://sayso.network/registration-submit/1",
  )
    .length === 0
) {
  errors.push("network/invalid-public-description: expected schema rejection");
}

const validPublicPacketRegistration = JSON.parse(
  readFileSync(path.join(payloadDir, "network/registration-submit-public-skill-packet.json"), "utf8"),
) as NetworkRegistrationSubmit;

const invalidMissingSkillPacket = JSON.parse(JSON.stringify(validPublicPacketRegistration)) as NetworkRegistrationSubmit;
if (invalidMissingSkillPacket.profile) delete invalidMissingSkillPacket.profile.skillPacket;
if (
  validate(
    schemas["sayso://sayso.network/registration-submit/1"],
    invalidMissingSkillPacket,
    "network/invalid-missing-skill-packet",
    "sayso://sayso.network/registration-submit/1",
  )
    .length === 0
) {
  errors.push("network/invalid-missing-skill-packet: expected schema rejection");
}

const networkQueryResponse = JSON.parse(
  readFileSync(path.join(payloadDir, "network/agent-query-response.json"), "utf8"),
) as NetworkQueryResponse;
for (const [index, result] of networkQueryResponse.results.entries()) {
  if (result.visibility !== "public") errors.push(`network/agent-query-response.json: result ${index} is not public`);
  if (result.skillDisclosure === "summary-only" && result.skillPacket) {
    errors.push(`network/agent-query-response.json: result ${index} summary-only record includes skillPacket`);
  }
  if (result.skillDisclosure === "include-skill-packet" && !result.skillPacket) {
    errors.push(`network/agent-query-response.json: result ${index} include-skill-packet record is missing skillPacket`);
  }
}

for (const exampleName of [
  "upgrade/upgrade-proposal-add-payment.json",
  "upgrade/upgrade-proposal-replace-protocol.json",
  "upgrade/upgrade-proposal-remove-extension.json",
  "upgrade/upgrade-proposal-protocol-handoff.json",
]) {
  const data = JSON.parse(readFileSync(path.join(payloadDir, exampleName), "utf8")) as UpgradeProposal;
  errors.push(...validateUpgradeProposalSemantics(data, exampleName));
}

const validUpgradeProposal = JSON.parse(
  readFileSync(path.join(payloadDir, "upgrade/upgrade-proposal-add-payment.json"), "utf8"),
) as UpgradeProposal;

const expectInvalidUpgradeProposal = (name: string, mutate: (proposal: UpgradeProposal) => void) => {
  const proposal = JSON.parse(JSON.stringify(validUpgradeProposal)) as UpgradeProposal;
  mutate(proposal);
  const result = validateUpgradeProposalSemantics(proposal, name);
  if (result.length === 0) errors.push(`${name}: expected invalid upgrade proposal`);
};

expectInvalidUpgradeProposal("upgrade/invalid-missing-protocol", (proposal) => {
  proposal.targetSkills = proposal.targetSkills?.filter((skill) => skill.skillId !== "sayso.protocol");
});

expectInvalidUpgradeProposal("upgrade/invalid-duplicate-target-skill", (proposal) => {
  if (proposal.targetSkills) proposal.targetSkills.push(proposal.targetSkills[0]);
});

expectInvalidUpgradeProposal("upgrade/invalid-change-target-mismatch", (proposal) => {
  proposal.targetSkills = proposal.targetSkills?.filter((skill) => skill.skillId !== "sayso.payment");
});

expectInvalidUpgradeProposal("upgrade/invalid-unresolved-import", (proposal) => {
  if (proposal.targetSkills) proposal.targetSkills[0].imports = [{ skillId: "sayso.missing" }];
});

const validHandoffProposal = JSON.parse(
  readFileSync(path.join(payloadDir, "upgrade/upgrade-proposal-protocol-handoff.json"), "utf8"),
) as UpgradeProposal;

const expectInvalidHandoffProposal = (name: string, mutate: (proposal: UpgradeProposal) => void) => {
  const proposal = JSON.parse(JSON.stringify(validHandoffProposal)) as UpgradeProposal;
  mutate(proposal);
  const result = validateUpgradeProposalSemantics(proposal, name);
  if (result.length === 0) errors.push(`${name}: expected invalid handoff proposal`);
};

expectInvalidHandoffProposal("upgrade/invalid-handoff-missing-protocol-id", (proposal) => {
  if (proposal.handoffProtocol) delete proposal.handoffProtocol.protocolId;
});

expectInvalidHandoffProposal("upgrade/invalid-handoff-missing-version", (proposal) => {
  if (proposal.handoffProtocol) delete proposal.handoffProtocol.version;
});

expectInvalidHandoffProposal("upgrade/invalid-handoff-missing-transport", (proposal) => {
  if (proposal.handoffProtocol) delete proposal.handoffProtocol.transport;
});

expectInvalidHandoffProposal("upgrade/invalid-handoff-missing-entry-types", (proposal) => {
  if (proposal.handoffProtocol) proposal.handoffProtocol.entryContentTypes = [];
});

expectInvalidHandoffProposal("upgrade/invalid-handoff-target-skills", (proposal) => {
  proposal.targetSkills = validUpgradeProposal.targetSkills;
});

for (const exampleName of [
  "reference-implementations/implementation-list-response.json",
  "reference-implementations/implementation-response.json",
]) {
  const data = JSON.parse(readFileSync(path.join(payloadDir, exampleName), "utf8")) as {
    implementations?: Array<{ implementationId: string; source: string; sha256: string }>;
    implementation?: { implementationId: string; source: string; sha256: string };
  };
  for (const implementation of data.implementations ?? (data.implementation ? [data.implementation] : [])) {
    const actual = createHash("sha256").update(implementation.source).digest("hex");
    if (actual !== implementation.sha256) {
      errors.push(`${exampleName}: sha256 mismatch for ${implementation.implementationId}`);
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("validated JSON examples");
