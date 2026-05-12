// Compile-time check: payload types in ../types.ts must not construct values
// the canonical SKILL.md schemas would reject. If tsc fails here, either
// regenerate (`pnpm gen:types`) or tighten types.ts to match the schema.
//
// This file is type-only and intentionally not imported anywhere at runtime.
//
// Forward direction only: [HandWritten] extends [Schema]. The tuple wrap is
// load-bearing — without it, `A extends B` distributes over naked unions and a
// drift in one branch (e.g. `accepts: T[]` vs `[T, ...T[]]` inside a oneOf) can
// be hidden when another branch happens to satisfy the schema.
//
// The reverse direction ([Schema] extends [HandWritten] — i.e. hand-written
// claims at least the guarantees the schema provides) is intentionally not
// asserted here. It would also catch real drift but would entangle deep
// nominal differences between hand-written and jstt-generated types (literal
// union collapse, `Record<string, unknown>` vs index signatures, etc.) that
// are spurious from a wire-contract perspective. Follow-up: add per-payload
// _xxxRev assertions where the reverse direction is feasible.

import type {
  AgentGetPayload,
  AgentGetResponsePayload,
  AgentInfoPayload,
  AgentQueryPayload,
  AgentQueryResponsePayload,
  ConfigurationRequestPayload,
  ConfigurationResponsePayload,
  ConnectionRequestPayload,
  ConnectionResponsePayload,
  DisconnectAckPayload,
  DisconnectPayload,
  ErrorPayload,
  ForgetMePayload,
  ForkOffersRequestPayload,
  ForkOffersResponsePayload,
  ForkRequestPayload,
  ForkResultPayload,
  PaymentRequiredPayload,
  PaymentResultPayload,
  PaymentSubmitPayload,
  PremiumRegistrationSubmitPayload,
  RegistrationRemovePayload,
  RegistrationResultPayload,
  RegistrationSubmitPayload,
  SkillRequestPayload,
  SkillResponsePayload,
  SourceChunkRequestPayload,
  SourceChunkResponsePayload,
  SourceManifestRequestPayload,
  SourceManifestResponsePayload,
} from "../types.js";

import type {
  AgentGetPayloadSchema,
  AgentGetResponsePayloadSchema,
  AgentInfoPayloadSchema,
  AgentQueryPayloadSchema,
  AgentQueryResponsePayloadSchema,
  ConfigurationRequestPayloadSchema,
  ConfigurationResponsePayloadSchema,
  ConnectionRequestPayloadSchema,
  ConnectionResponsePayloadSchema,
  DisconnectAckPayloadSchema,
  DisconnectPayloadSchema,
  ErrorPayloadSchema,
  ForgetMePayloadSchema,
  ForkOffersRequestPayloadSchema,
  ForkOffersResponsePayloadSchema,
  ForkRequestPayloadSchema,
  ForkResultPayloadSchema,
  PaymentRequiredPayloadSchema,
  PaymentResultPayloadSchema,
  PaymentSubmitPayloadSchema,
  PremiumRegistrationSubmitPayloadSchema,
  RegistrationRemovePayloadSchema,
  RegistrationResultPayloadSchema,
  RegistrationSubmitPayloadSchema,
  SkillRequestPayloadSchema,
  SkillResponsePayloadSchema,
  SourceChunkRequestPayloadSchema,
  SourceChunkResponsePayloadSchema,
  SourceManifestRequestPayloadSchema,
  SourceManifestResponsePayloadSchema,
} from "./payloadTypes.js";

type AssertExact<A, B> = [A] extends [B] ? true : never;

const _agentInfo: AssertExact<AgentInfoPayload, AgentInfoPayloadSchema> = true;
const _connRequest: AssertExact<ConnectionRequestPayload, ConnectionRequestPayloadSchema> = true;
const _connResponse: AssertExact<ConnectionResponsePayload, ConnectionResponsePayloadSchema> = true;
const _skillRequest: AssertExact<SkillRequestPayload, SkillRequestPayloadSchema> = true;
const _skillResponse: AssertExact<SkillResponsePayload, SkillResponsePayloadSchema> = true;
const _disconnect: AssertExact<DisconnectPayload, DisconnectPayloadSchema> = true;
const _forgetMe: AssertExact<ForgetMePayload, ForgetMePayloadSchema> = true;
const _disconnectAck: AssertExact<DisconnectAckPayload, DisconnectAckPayloadSchema> = true;
const _error: AssertExact<ErrorPayload, ErrorPayloadSchema> = true;
const _registrationSubmit: AssertExact<RegistrationSubmitPayload, RegistrationSubmitPayloadSchema> = true;
const _premiumRegistrationSubmit: AssertExact<PremiumRegistrationSubmitPayload, PremiumRegistrationSubmitPayloadSchema> = true;
const _registrationResult: AssertExact<RegistrationResultPayload, RegistrationResultPayloadSchema> = true;
const _registrationRemove: AssertExact<RegistrationRemovePayload, RegistrationRemovePayloadSchema> = true;
const _agentQuery: AssertExact<AgentQueryPayload, AgentQueryPayloadSchema> = true;
const _agentQueryResponse: AssertExact<AgentQueryResponsePayload, AgentQueryResponsePayloadSchema> = true;
const _agentGet: AssertExact<AgentGetPayload, AgentGetPayloadSchema> = true;
const _agentGetResponse: AssertExact<AgentGetResponsePayload, AgentGetResponsePayloadSchema> = true;
const _paymentRequired: AssertExact<PaymentRequiredPayload, PaymentRequiredPayloadSchema> = true;
const _paymentSubmit: AssertExact<PaymentSubmitPayload, PaymentSubmitPayloadSchema> = true;
const _paymentResult: AssertExact<PaymentResultPayload, PaymentResultPayloadSchema> = true;
const _configRequest: AssertExact<ConfigurationRequestPayload, ConfigurationRequestPayloadSchema> = true;
const _configResponse: AssertExact<ConfigurationResponsePayload, ConfigurationResponsePayloadSchema> = true;
const _sourceManifestRequest: AssertExact<SourceManifestRequestPayload, SourceManifestRequestPayloadSchema> = true;
const _sourceManifestResponse: AssertExact<SourceManifestResponsePayload, SourceManifestResponsePayloadSchema> = true;
const _sourceChunkRequest: AssertExact<SourceChunkRequestPayload, SourceChunkRequestPayloadSchema> = true;
const _sourceChunkResponse: AssertExact<SourceChunkResponsePayload, SourceChunkResponsePayloadSchema> = true;
const _forkOffersRequest: AssertExact<ForkOffersRequestPayload, ForkOffersRequestPayloadSchema> = true;
const _forkOffersResponse: AssertExact<ForkOffersResponsePayload, ForkOffersResponsePayloadSchema> = true;
const _forkRequest: AssertExact<ForkRequestPayload, ForkRequestPayloadSchema> = true;
const _forkResult: AssertExact<ForkResultPayload, ForkResultPayloadSchema> = true;

// Silence "declared but never read"
export {
  _agentInfo,
  _connRequest,
  _connResponse,
  _skillRequest,
  _skillResponse,
  _disconnect,
  _forgetMe,
  _disconnectAck,
  _error,
  _registrationSubmit,
  _premiumRegistrationSubmit,
  _registrationResult,
  _registrationRemove,
  _agentQuery,
  _agentQueryResponse,
  _agentGet,
  _agentGetResponse,
  _paymentRequired,
  _paymentSubmit,
  _paymentResult,
  _configRequest,
  _configResponse,
  _sourceManifestRequest,
  _sourceManifestResponse,
  _sourceChunkRequest,
  _sourceChunkResponse,
  _forkOffersRequest,
  _forkOffersResponse,
  _forkRequest,
  _forkResult,
};
