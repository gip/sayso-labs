#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";
import { findSkillSchemaRoot, loadSkillSchemaCatalog, type SkillSchemaCatalog } from "../src/schemaExtractor.js";

type SchemaNode = Record<string, unknown> | unknown[] | string | number | boolean | null;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.resolve(HERE, "../src/generated/payloadTypes.ts");

const PAYLOAD_SPECS: Array<{ id: string; typeName: string }> = [
  { id: "sayso://sayso.protocol/agent-info/1", typeName: "AgentInfoPayloadSchema" },
  { id: "sayso://sayso.protocol/connection-request/1", typeName: "ConnectionRequestPayloadSchema" },
  { id: "sayso://sayso.protocol/connection-response/1", typeName: "ConnectionResponsePayloadSchema" },
  { id: "sayso://sayso.protocol/skill-request/1", typeName: "SkillRequestPayloadSchema" },
  { id: "sayso://sayso.protocol/skill-response/1", typeName: "SkillResponsePayloadSchema" },
  { id: "sayso://sayso.protocol/disconnect/1", typeName: "DisconnectPayloadSchema" },
  { id: "sayso://sayso.protocol/forget-me/1", typeName: "ForgetMePayloadSchema" },
  { id: "sayso://sayso.protocol/disconnect-ack/1", typeName: "DisconnectAckPayloadSchema" },
  { id: "sayso://sayso.protocol/error/1", typeName: "ErrorPayloadSchema" },
  { id: "sayso://sayso.network/registration-submit/1", typeName: "RegistrationSubmitPayloadSchema" },
  { id: "sayso://sayso.network/premium-registration-submit/1", typeName: "PremiumRegistrationSubmitPayloadSchema" },
  { id: "sayso://sayso.network/registration-result/1", typeName: "RegistrationResultPayloadSchema" },
  { id: "sayso://sayso.network/registration-remove/1", typeName: "RegistrationRemovePayloadSchema" },
  { id: "sayso://sayso.network/agent-query/1", typeName: "AgentQueryPayloadSchema" },
  { id: "sayso://sayso.network/agent-query-response/1", typeName: "AgentQueryResponsePayloadSchema" },
  { id: "sayso://sayso.network/agent-get/1", typeName: "AgentGetPayloadSchema" },
  { id: "sayso://sayso.network/agent-get-response/1", typeName: "AgentGetResponsePayloadSchema" },
  { id: "sayso://sayso.payment/payment-required/1", typeName: "PaymentRequiredPayloadSchema" },
  { id: "sayso://sayso.payment/payment-submit/1", typeName: "PaymentSubmitPayloadSchema" },
  { id: "sayso://sayso.payment/payment-result/1", typeName: "PaymentResultPayloadSchema" },
  { id: "sayso://sayso.configure/configuration-request/1", typeName: "ConfigurationRequestPayloadSchema" },
  { id: "sayso://sayso.configure/configuration-response/1", typeName: "ConfigurationResponsePayloadSchema" },
  { id: "sayso://sayso.source/source-manifest-request/1", typeName: "SourceManifestRequestPayloadSchema" },
  { id: "sayso://sayso.source/source-manifest-response/1", typeName: "SourceManifestResponsePayloadSchema" },
  { id: "sayso://sayso.source/source-chunk-request/1", typeName: "SourceChunkRequestPayloadSchema" },
  { id: "sayso://sayso.source/source-chunk-response/1", typeName: "SourceChunkResponsePayloadSchema" },
  { id: "sayso://sayso.fork/fork-offers-request/1", typeName: "ForkOffersRequestPayloadSchema" },
  { id: "sayso://sayso.fork/fork-offers-response/1", typeName: "ForkOffersResponsePayloadSchema" },
  { id: "sayso://sayso.fork/fork-request/1", typeName: "ForkRequestPayloadSchema" },
  { id: "sayso://sayso.fork/fork-result/1", typeName: "ForkResultPayloadSchema" },
  { id: "sayso://sayso.upgrade/upgrade-proposal/1", typeName: "UpgradeProposalPayloadSchema" },
  { id: "sayso://sayso.upgrade/upgrade-accept/1", typeName: "UpgradeAcceptPayloadSchema" },
  { id: "sayso://sayso.upgrade/upgrade-reject/1", typeName: "UpgradeRejectPayloadSchema" },
];

const resolvePointer = (root: Record<string, unknown>, pointer: string): SchemaNode => {
  const segments = pointer.split("/").slice(1).map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cursor: SchemaNode = root;
  for (const segment of segments) {
    if (cursor === null || typeof cursor !== "object" || Array.isArray(cursor)) {
      throw new Error(`Cannot resolve JSON pointer segment ${segment}: parent is not an object.`);
    }
    const next = (cursor as Record<string, unknown>)[segment];
    if (next === undefined) {
      throw new Error(`JSON pointer segment ${segment} not found.`);
    }
    cursor = next as SchemaNode;
  }
  return cursor;
};

const inlineRefs = (
  node: SchemaNode,
  catalog: SkillSchemaCatalog,
  stack: string[] = [],
): SchemaNode => {
  if (Array.isArray(node)) {
    return node.map((entry) => inlineRefs(entry as SchemaNode, catalog, stack));
  }
  if (node === null || typeof node !== "object") return node;
  const record = node as Record<string, unknown>;
  if (typeof record.$ref === "string") {
    const ref = record.$ref;
    if (stack.includes(ref)) {
      return { description: `Circular reference to ${ref}.` };
    }
    const [schemaId, jsonPointer] = ref.split("#");
    const target = catalog.schemasById.get(schemaId);
    if (!target) throw new Error(`Unknown schema $ref ${ref}.`);
    const resolved = jsonPointer ? resolvePointer(target.schema, jsonPointer) : target.schema;
    return inlineRefs(resolved as SchemaNode, catalog, [...stack, ref]);
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === "$id") continue;
    if (key === "x-sayso-authority") continue;
    if (key === "x-sayso-content-type") continue;
    if (key === "x-sayso-claim-type") continue;
    out[key] = inlineRefs(value as SchemaNode, catalog, stack);
  }
  return out;
};

const main = async () => {
  const root = findSkillSchemaRoot();
  const catalog = loadSkillSchemaCatalog({ root });

  const banner = `/* eslint-disable */\n// Auto-generated by packages/protocol/scripts/generate-payload-types.ts.\n// Source of truth: JSON Schemas in skills/sayso-*/SKILL.md.\n// Do not edit by hand. Run \`pnpm --filter @sayso-labs/protocol gen:types\` to regenerate.`;

  const sections: string[] = [];
  for (const spec of PAYLOAD_SPECS) {
    const schemaEntry = catalog.schemasById.get(spec.id);
    if (!schemaEntry) {
      throw new Error(`Schema not found in catalog: ${spec.id}`);
    }
    const inlined = inlineRefs(schemaEntry.schema as SchemaNode, catalog) as Record<string, unknown>;
    inlined.title = spec.typeName;
    const compiled = await compile(inlined as Parameters<typeof compile>[0], spec.typeName, {
      bannerComment: "",
      additionalProperties: false,
      style: { singleQuote: false, tabWidth: 2 },
      strictIndexSignatures: false,
      unreachableDefinitions: false,
      declareExternallyReferenced: true,
    });
    sections.push(compiled.trim());
  }

  const output = `${banner}\n\n${sections.join("\n\n")}\n`;

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, output, "utf8");
  console.log(`Wrote ${OUTPUT_PATH} (${PAYLOAD_SPECS.length} payload schemas).`);
};

await main();
