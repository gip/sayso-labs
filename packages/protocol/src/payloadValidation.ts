import * as Ajv2020Module from "ajv/dist/2020.js";
import * as addFormatsModule from "ajv-formats";
import { loadSkillSchemaCatalog, type ExtractedSkillSchema, type SkillSchemaCatalog } from "./schemaExtractor.js";

export type PayloadName =
  | "agent-info"
  | "connection-request"
  | "connection-response"
  | "skill-request"
  | "skill-response"
  | "disconnect"
  | "forget-me"
  | "disconnect-ack"
  | "error"
  | "registration-submit"
  | "premium-registration-submit"
  | "registration-result"
  | "registration-remove"
  | "agent-query"
  | "agent-query-response"
  | "agent-get"
  | "agent-get-response"
  | "payment-required"
  | "payment-submit"
  | "payment-result"
  | "configuration-request"
  | "configuration-response"
  | "source-manifest-request"
  | "source-manifest-response"
  | "source-chunk-request"
  | "source-chunk-response"
  | "fork-offers-request"
  | "fork-offers-response"
  | "fork-request"
  | "fork-result"
  | "upgrade-proposal"
  | "upgrade-accept"
  | "upgrade-reject";

const PAYLOAD_SCHEMA_IDS: Record<PayloadName, string> = {
  "agent-info": "sayso://sayso.protocol/agent-info/1",
  "connection-request": "sayso://sayso.protocol/connection-request/1",
  "connection-response": "sayso://sayso.protocol/connection-response/1",
  "skill-request": "sayso://sayso.protocol/skill-request/1",
  "skill-response": "sayso://sayso.protocol/skill-response/1",
  "disconnect": "sayso://sayso.protocol/disconnect/1",
  "forget-me": "sayso://sayso.protocol/forget-me/1",
  "disconnect-ack": "sayso://sayso.protocol/disconnect-ack/1",
  "error": "sayso://sayso.protocol/error/1",
  "registration-submit": "sayso://sayso.network/registration-submit/1",
  "premium-registration-submit": "sayso://sayso.network/premium-registration-submit/1",
  "registration-result": "sayso://sayso.network/registration-result/1",
  "registration-remove": "sayso://sayso.network/registration-remove/1",
  "agent-query": "sayso://sayso.network/agent-query/1",
  "agent-query-response": "sayso://sayso.network/agent-query-response/1",
  "agent-get": "sayso://sayso.network/agent-get/1",
  "agent-get-response": "sayso://sayso.network/agent-get-response/1",
  "payment-required": "sayso://sayso.payment/payment-required/1",
  "payment-submit": "sayso://sayso.payment/payment-submit/1",
  "payment-result": "sayso://sayso.payment/payment-result/1",
  "configuration-request": "sayso://sayso.configure/configuration-request/1",
  "configuration-response": "sayso://sayso.configure/configuration-response/1",
  "source-manifest-request": "sayso://sayso.source/source-manifest-request/1",
  "source-manifest-response": "sayso://sayso.source/source-manifest-response/1",
  "source-chunk-request": "sayso://sayso.source/source-chunk-request/1",
  "source-chunk-response": "sayso://sayso.source/source-chunk-response/1",
  "fork-offers-request": "sayso://sayso.fork/fork-offers-request/1",
  "fork-offers-response": "sayso://sayso.fork/fork-offers-response/1",
  "fork-request": "sayso://sayso.fork/fork-request/1",
  "fork-result": "sayso://sayso.fork/fork-result/1",
  "upgrade-proposal": "sayso://sayso.upgrade/upgrade-proposal/1",
  "upgrade-accept": "sayso://sayso.upgrade/upgrade-accept/1",
  "upgrade-reject": "sayso://sayso.upgrade/upgrade-reject/1",
};

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

export type PayloadParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type PayloadValidatorOptions = {
  catalog?: SkillSchemaCatalog;
  root?: string;
};

export class PayloadValidator {
  private readonly ajv: AjvLike;

  constructor(options: PayloadValidatorOptions = {}) {
    this.ajv = new AjvCtor({ strict: false, allErrors: true });
    addFormats(this.ajv);
    const catalog = options.catalog ?? loadSkillSchemaCatalog(options.root ? { root: options.root } : undefined);
    for (const entry of catalog.schemas as ExtractedSkillSchema[]) {
      this.ajv.addSchema(entry.schema);
    }
  }

  parse<T>(name: PayloadName, value: unknown): PayloadParseResult<T> {
    const validate = this.ajv.getSchema(PAYLOAD_SCHEMA_IDS[name]);
    if (!validate) return { ok: false, error: `Missing schema for ${name}.` };
    if (validate(value)) return { ok: true, value: value as T };
    return { ok: false, error: this.ajv.errorsText(validate.errors, { separator: "; " }) };
  }

  check(name: PayloadName, value: unknown): boolean {
    return this.parse(name, value).ok;
  }
}

let sharedValidator: PayloadValidator | null = null;

const defaultValidator = (): PayloadValidator => {
  if (!sharedValidator) sharedValidator = new PayloadValidator();
  return sharedValidator;
};

export const parsePayload = <T>(name: PayloadName, value: unknown): PayloadParseResult<T> =>
  defaultValidator().parse<T>(name, value);

export const isValidPayload = (name: PayloadName, value: unknown): boolean =>
  defaultValidator().check(name, value);

export const resetDefaultPayloadValidator = (): void => {
  sharedValidator = null;
};
