import { parsePayload, type PayloadParseResult } from "./payloadValidation.js";
import { isRecord } from "./predicates.js";
import type {
  AgentGetPayload,
  AgentQueryPayload,
  ConfigurationRequestPayload,
  ConnectionRequestPayload,
  ForkOffersRequestPayload,
  ForkRequestPayload,
  PaymentSubmitPayload,
  PremiumRegistrationSubmitPayload,
  RegistrationRemovePayload,
  RegistrationSubmitPayload,
  SkillRequestPayload,
  SourceChunkRequestPayload,
  SourceManifestRequestPayload,
} from "./types.js";

export { isRecord };

const toNullable = <T>(result: PayloadParseResult<T>): T | null => (result.ok ? result.value : null);

export const isConnectionRequest = (value: unknown): value is ConnectionRequestPayload =>
  parsePayload<ConnectionRequestPayload>("connection-request", value).ok;

export const parseSkillRequest = (value: unknown): SkillRequestPayload | null =>
  toNullable(parsePayload<SkillRequestPayload>("skill-request", value));

export const parseRegistrationSubmit = (value: unknown): RegistrationSubmitPayload | null =>
  toNullable(parsePayload<RegistrationSubmitPayload>("registration-submit", value));

export const parsePremiumRegistrationSubmit = (value: unknown): PremiumRegistrationSubmitPayload | null =>
  toNullable(parsePayload<PremiumRegistrationSubmitPayload>("premium-registration-submit", value));

export const parseRegistrationRemove = (value: unknown): RegistrationRemovePayload | null =>
  toNullable(parsePayload<RegistrationRemovePayload>("registration-remove", value));

export const parseAgentQuery = (value: unknown): AgentQueryPayload | null =>
  toNullable(parsePayload<AgentQueryPayload>("agent-query", value));

export const parseAgentGet = (value: unknown): AgentGetPayload | null =>
  toNullable(parsePayload<AgentGetPayload>("agent-get", value));

export const parsePaymentSubmit = (value: unknown): PaymentSubmitPayload | null =>
  toNullable(parsePayload<PaymentSubmitPayload>("payment-submit", value));

export const parseConfigurationRequest = (value: unknown): ConfigurationRequestPayload | null =>
  toNullable(parsePayload<ConfigurationRequestPayload>("configuration-request", value));

export const parseSourceManifestRequest = (value: unknown): SourceManifestRequestPayload | null =>
  toNullable(parsePayload<SourceManifestRequestPayload>("source-manifest-request", value));

export const parseSourceChunkRequest = (value: unknown): SourceChunkRequestPayload | null =>
  toNullable(parsePayload<SourceChunkRequestPayload>("source-chunk-request", value));

export const parseForkOffersRequest = (value: unknown): ForkOffersRequestPayload | null =>
  toNullable(parsePayload<ForkOffersRequestPayload>("fork-offers-request", value));

export const parseForkRequest = (value: unknown): ForkRequestPayload | null =>
  toNullable(parsePayload<ForkRequestPayload>("fork-request", value));
