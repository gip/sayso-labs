import { describe, expect, it } from "vitest";
import type { JsonSchema } from "./schemaExtractor.js";
import { loadSkillSchemaCatalog } from "./schemaExtractor.js";

const expectedContentTypeSchemas = [
  "sayso.protocol/agent-info/1",
  "sayso.protocol/connection-request/1",
  "sayso.protocol/connection-response/1",
  "sayso.protocol/skill-request/1",
  "sayso.protocol/skill-response/1",
  "sayso.protocol/disconnect/1",
  "sayso.protocol/forget-me/1",
  "sayso.protocol/disconnect-ack/1",
  "sayso.protocol/error/1",
  "sayso.payment/payment-required/1",
  "sayso.payment/payment-submit/1",
  "sayso.payment/payment-result/1",
  "sayso.network/registration-submit/1",
  "sayso.network/premium-registration-submit/1",
  "sayso.network/registration-result/1",
  "sayso.network/registration-remove/1",
  "sayso.network/agent-query/1",
  "sayso.network/agent-query-response/1",
  "sayso.network/agent-get/1",
  "sayso.network/agent-get-response/1",
  "sayso.upgrade/upgrade-proposal/1",
  "sayso.upgrade/upgrade-accept/1",
  "sayso.upgrade/upgrade-reject/1",
  "sayso.configure/configuration-request/1",
  "sayso.configure/configuration-response/1",
  "sayso.source/source-manifest-request/1",
  "sayso.source/source-manifest-response/1",
  "sayso.source/source-chunk-request/1",
  "sayso.source/source-chunk-response/1",
  "sayso.fork/fork-offers-request/1",
  "sayso.fork/fork-offers-response/1",
  "sayso.fork/fork-request/1",
  "sayso.fork/fork-result/1",
  "sayso.demo.pong/ping-request/1",
  "sayso.demo.pong/pong-response/1",
  "sayso.reference-implementations/implementation-list-request/1",
  "sayso.reference-implementations/implementation-list-response/1",
  "sayso.reference-implementations/implementation-request/1",
  "sayso.reference-implementations/implementation-response/1",
];

const collectRefs = (schema: unknown, refs: string[] = []): string[] => {
  if (Array.isArray(schema)) {
    for (const item of schema) collectRefs(item, refs);
    return refs;
  }
  if (typeof schema !== "object" || schema === null) return refs;
  const record = schema as Record<string, unknown>;
  if (typeof record.$ref === "string") refs.push(record.$ref);
  for (const value of Object.values(record)) collectRefs(value, refs);
  return refs;
};

const resolveRef = (schemas: Map<string, { schema: JsonSchema }>, ref: string, currentId: string) => {
  const [schemaId, fragment = ""] = ref.split("#");
  let schema: unknown = schemas.get(schemaId || currentId)?.schema;
  if (!schema) return undefined;
  for (const part of fragment
    .replace(/^\//, "")
    .split("/")
    .filter(Boolean)
    .map((item) => item.replace(/~1/g, "/").replace(/~0/g, "~"))) {
    schema = (schema as Record<string, unknown>)[part];
  }
  return schema;
};

describe("Markdown schema extractor", () => {
  it("loads the expected content type and claim schemas from SKILL.md files", () => {
    const catalog = loadSkillSchemaCatalog();

    for (const key of expectedContentTypeSchemas) {
      expect(catalog.contentTypeSchemas.has(key), key).toBe(true);
    }

    expect(catalog.claimSchemas.has("sayso.claim.world-id.wallet")).toBe(true);
    expect(catalog.claimSchemas.has("sayso.claim.wallet-control")).toBe(true);
    expect(catalog.claimSchemas.has("sayso.claim.agent-connection")).toBe(true);
  });

  it("resolves every embedded schema ref", () => {
    const catalog = loadSkillSchemaCatalog();

    for (const entry of catalog.schemas) {
      for (const ref of collectRefs(entry.schema)) {
        expect(resolveRef(catalog.schemasById, ref, entry.id), `${entry.id} -> ${ref}`).toBeDefined();
      }
    }
  });
});
