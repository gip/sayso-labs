#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";
import { findSkillSchemaRoot, loadSkillSchemaCatalog } from "../src/schemaExtractor.js";

type SchemaNode = Record<string, unknown> | unknown[] | string | number | boolean | null;
type SchemaObject = Record<string, unknown>;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.resolve(HERE, "../src/generated/payloadTypes.ts");

// Payloads to emit. The defs key is what jstt will turn into a TS interface name.
const PAYLOAD_SPECS: Array<{ id: string; defKey: string }> = [
  { id: "sayso://sayso.protocol/agent-info/1", defKey: "agentInfoPayloadSchema" },
  { id: "sayso://sayso.protocol/connection-request/1", defKey: "connectionRequestPayloadSchema" },
  { id: "sayso://sayso.protocol/connection-response/1", defKey: "connectionResponsePayloadSchema" },
  { id: "sayso://sayso.protocol/skill-request/1", defKey: "skillRequestPayloadSchema" },
  { id: "sayso://sayso.protocol/skill-response/1", defKey: "skillResponsePayloadSchema" },
  { id: "sayso://sayso.protocol/disconnect/1", defKey: "disconnectPayloadSchema" },
  { id: "sayso://sayso.protocol/forget-me/1", defKey: "forgetMePayloadSchema" },
  { id: "sayso://sayso.protocol/disconnect-ack/1", defKey: "disconnectAckPayloadSchema" },
  { id: "sayso://sayso.protocol/error/1", defKey: "errorPayloadSchema" },
  { id: "sayso://sayso.network/registration-submit/1", defKey: "registrationSubmitPayloadSchema" },
  { id: "sayso://sayso.network/premium-registration-submit/1", defKey: "premiumRegistrationSubmitPayloadSchema" },
  { id: "sayso://sayso.network/registration-result/1", defKey: "registrationResultPayloadSchema" },
  { id: "sayso://sayso.network/registration-remove/1", defKey: "registrationRemovePayloadSchema" },
  { id: "sayso://sayso.network/agent-query/1", defKey: "agentQueryPayloadSchema" },
  { id: "sayso://sayso.network/agent-query-response/1", defKey: "agentQueryResponsePayloadSchema" },
  { id: "sayso://sayso.network/agent-get/1", defKey: "agentGetPayloadSchema" },
  { id: "sayso://sayso.network/agent-get-response/1", defKey: "agentGetResponsePayloadSchema" },
  { id: "sayso://sayso.payment/payment-required/1", defKey: "paymentRequiredPayloadSchema" },
  { id: "sayso://sayso.payment/payment-submit/1", defKey: "paymentSubmitPayloadSchema" },
  { id: "sayso://sayso.payment/payment-result/1", defKey: "paymentResultPayloadSchema" },
  { id: "sayso://sayso.configure/configuration-request/1", defKey: "configurationRequestPayloadSchema" },
  { id: "sayso://sayso.configure/configuration-response/1", defKey: "configurationResponsePayloadSchema" },
  { id: "sayso://sayso.source/source-manifest-request/1", defKey: "sourceManifestRequestPayloadSchema" },
  { id: "sayso://sayso.source/source-manifest-response/1", defKey: "sourceManifestResponsePayloadSchema" },
  { id: "sayso://sayso.source/source-chunk-request/1", defKey: "sourceChunkRequestPayloadSchema" },
  { id: "sayso://sayso.source/source-chunk-response/1", defKey: "sourceChunkResponsePayloadSchema" },
  { id: "sayso://sayso.fork/fork-offers-request/1", defKey: "forkOffersRequestPayloadSchema" },
  { id: "sayso://sayso.fork/fork-offers-response/1", defKey: "forkOffersResponsePayloadSchema" },
  { id: "sayso://sayso.fork/fork-request/1", defKey: "forkRequestPayloadSchema" },
  { id: "sayso://sayso.fork/fork-result/1", defKey: "forkResultPayloadSchema" },
  { id: "sayso://sayso.upgrade/upgrade-proposal/1", defKey: "upgradeProposalPayloadSchema" },
  { id: "sayso://sayso.upgrade/upgrade-accept/1", defKey: "upgradeAcceptPayloadSchema" },
  { id: "sayso://sayso.upgrade/upgrade-reject/1", defKey: "upgradeRejectPayloadSchema" },
];

// Strip these when rewriting; $defs-key drives the generated TS name, and the
// extension fields aren't meaningful to jstt.
const STRIPPED_FIELDS = new Set([
  "$id",
  "$schema",
  "title",
  "x-sayso-authority",
  "x-sayso-content-type",
  "x-sayso-claim-type",
]);

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const isObject = (value: unknown): value is SchemaObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const main = async () => {
  const root = findSkillSchemaRoot();
  const catalog = loadSkillSchemaCatalog({ root });

  // Map every cross-schema $ref to a local ref into the merged $defs registry.
  // Key: original $ref string (e.g. "sayso://sayso.protocol/common#/$defs/agentInfo")
  // Value: local ref string (e.g. "#/$defs/protocolAgentInfoSchema")
  const refRewrites = new Map<string, string>();
  const mergedDefs: Record<string, SchemaObject> = {};

  // Collect $defs from every "common" schema, renaming to <shortAuthority><DefName>Schema.
  for (const entry of catalog.schemas) {
    if (!entry.id.endsWith("/common")) continue;
    const authorityMatch = entry.id.match(/^sayso:\/\/sayso\.([a-z]+)\/common$/);
    if (!authorityMatch) throw new Error(`Unexpected common schema $id: ${entry.id}`);
    const shortAuthority = authorityMatch[1]; // protocol, payment, network, ...
    const defs = (entry.schema as SchemaObject).$defs;
    if (!isObject(defs)) continue;
    for (const [defName, defSchema] of Object.entries(defs)) {
      if (!isObject(defSchema)) continue;
      const renamedKey = `${shortAuthority}${capitalize(defName)}Schema`;
      refRewrites.set(`${entry.id}#/$defs/${defName}`, `#/$defs/${renamedKey}`);
      mergedDefs[renamedKey] = defSchema;
    }
  }

  const rewriteRefs = (node: SchemaNode): SchemaNode => {
    if (Array.isArray(node)) return node.map((item) => rewriteRefs(item as SchemaNode));
    if (!isObject(node)) return node;
    const out: SchemaObject = {};
    for (const [key, value] of Object.entries(node)) {
      if (STRIPPED_FIELDS.has(key)) continue;
      if (key === "$ref" && typeof value === "string") {
        const rewritten = refRewrites.get(value);
        if (!rewritten) throw new Error(`Unrecognized $ref: ${value}`);
        out.$ref = rewritten;
        continue;
      }
      out[key] = rewriteRefs(value as SchemaNode);
    }
    return out;
  };

  // Rewrite refs inside the merged defs (they reference each other).
  for (const key of Object.keys(mergedDefs)) {
    mergedDefs[key] = rewriteRefs(mergedDefs[key]) as SchemaObject;
  }

  // Add each payload schema to the merged registry under its desired type name.
  for (const spec of PAYLOAD_SPECS) {
    const entry = catalog.schemasById.get(spec.id);
    if (!entry) throw new Error(`Schema not found in catalog: ${spec.id}`);
    mergedDefs[spec.defKey] = rewriteRefs(entry.schema as SchemaNode) as SchemaObject;
  }

  // Root wrapper that references every payload, ensuring all defs are reachable.
  const rootSchema: SchemaObject = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "sayso://generated/payloadTypes",
    title: "SaySoGeneratedPayloadSchemas",
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(
      PAYLOAD_SPECS.map((spec) => [spec.defKey, { $ref: `#/$defs/${spec.defKey}` }]),
    ),
    $defs: mergedDefs,
  };

  const compiled = await compile(rootSchema as Parameters<typeof compile>[0], "SaySoGeneratedPayloadSchemas", {
    bannerComment: "",
    additionalProperties: false,
    declareExternallyReferenced: true,
    enableConstEnums: false,
    strictIndexSignatures: false,
    unreachableDefinitions: true,
    style: { singleQuote: false, tabWidth: 2 },
  });

  const banner = [
    "/* eslint-disable */",
    "// Auto-generated by packages/protocol/scripts/generate-payload-types.ts.",
    "// Source of truth: JSON Schemas in skills/sayso-*/SKILL.md.",
    "// Do not edit by hand. Run `pnpm --filter @sayso-labs/protocol gen:types` to regenerate.",
  ].join("\n");

  const output = `${banner}\n\n${compiled.trim()}\n`;

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, output, "utf8");
  console.log(
    `Wrote ${OUTPUT_PATH} (${PAYLOAD_SPECS.length} payloads + ${Object.keys(mergedDefs).length - PAYLOAD_SPECS.length} shared defs).`,
  );
};

await main();
