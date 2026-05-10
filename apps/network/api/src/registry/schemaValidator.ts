import { existsSync } from "node:fs";
import path from "node:path";
import { loadSkillSchemaCatalog } from "@sayso-labs/protocol";
import * as Ajv2020Module from "ajv/dist/2020.js";
import * as addFormatsModule from "ajv-formats";

const findRepoRoot = () => {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../.."),
    path.resolve(process.cwd(), "../../.."),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "skills/sayso-protocol/SKILL.md")) && existsSync(path.join(candidate, "skills/sayso-network/SKILL.md"))) {
      return candidate;
    }
    if (existsSync(path.join(candidate, "../skills/sayso-protocol/SKILL.md")) && existsSync(path.join(candidate, "SKILL.md"))) {
      return path.resolve(candidate, "..");
    }
  }
  return path.resolve(process.cwd(), "../..");
};

export type NetworkSchemaName =
  | "registration-submit"
  | "premium-registration-submit"
  | "registration-remove"
  | "agent-query"
  | "agent-get"
  | "payment-submit";

type SchemaValidate = ((payload: unknown) => boolean) & {
  errors?: unknown;
};

type AjvLike = {
  addSchema(schema: Record<string, unknown>, key?: string): void;
  getSchema(key: string): SchemaValidate | undefined;
  errorsText(errors: unknown, options: { separator: string }): string;
};

const AjvCtor = ("default" in Ajv2020Module ? Ajv2020Module.default : Ajv2020Module) as unknown as new (
  options: Record<string, unknown>,
) => AjvLike;

const addFormats = ("default" in addFormatsModule ? addFormatsModule.default : addFormatsModule) as unknown as (
  ajv: AjvLike,
) => void;

export class NetworkSchemaValidator {
  private readonly ajv = new AjvCtor({ strict: false, allErrors: true });
  private readonly schemaRoot = findRepoRoot();
  private readonly schemaIds: Record<NetworkSchemaName, string> = {
    "registration-submit": "sayso://sayso.network/registration-submit/1",
    "premium-registration-submit": "sayso://sayso.network/premium-registration-submit/1",
    "registration-remove": "sayso://sayso.network/registration-remove/1",
    "agent-query": "sayso://sayso.network/agent-query/1",
    "agent-get": "sayso://sayso.network/agent-get/1",
    "payment-submit": "sayso://sayso.payment/payment-submit/1",
  };

  constructor() {
    addFormats(this.ajv);
    const catalog = loadSkillSchemaCatalog({ root: this.schemaRoot });
    for (const entry of catalog.schemas) this.ajv.addSchema(entry.schema);
  }

  validate(name: NetworkSchemaName, payload: unknown) {
    const validate = this.ajv.getSchema(this.schemaIds[name]);
    if (!validate) return { ok: false, message: `Missing schema ${name}.` };
    if (validate(payload)) return { ok: true as const };
    return {
      ok: false as const,
      message: this.ajv.errorsText(validate.errors, { separator: "; " }),
    };
  }
}
