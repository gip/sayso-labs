// Compile-time check: payload types in ../types.ts must be structurally compatible
// with the schema-derived types in ./payloadTypes.ts. If tsc fails here, either
// regenerate (`pnpm gen:types`) or align types.ts with the canonical SKILL.md schemas.
//
// This file is type-only and intentionally not imported anywhere at runtime.

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

// Bidirectional structural assignability. If a payload type drifts from its schema
// counterpart in either direction, one of these lines will fail to typecheck.
type AssertAssignable<A, B> = A extends B ? true : never;

// Hand-written → schema-generated
const _agentInfoFwd: AssertAssignable<AgentInfoPayload, AgentInfoPayloadSchema> = true;
const _connRequestFwd: AssertAssignable<ConnectionRequestPayload, ConnectionRequestPayloadSchema> = true;
const _connResponseFwd: AssertAssignable<ConnectionResponsePayload, ConnectionResponsePayloadSchema> = true;
const _skillRequestFwd: AssertAssignable<SkillRequestPayload, SkillRequestPayloadSchema> = true;
const _skillResponseFwd: AssertAssignable<SkillResponsePayload, SkillResponsePayloadSchema> = true;
const _disconnectFwd: AssertAssignable<DisconnectPayload, DisconnectPayloadSchema> = true;
const _forgetMeFwd: AssertAssignable<ForgetMePayload, ForgetMePayloadSchema> = true;
const _disconnectAckFwd: AssertAssignable<DisconnectAckPayload, DisconnectAckPayloadSchema> = true;
const _errorFwd: AssertAssignable<ErrorPayload, ErrorPayloadSchema> = true;
const _registrationSubmitFwd: AssertAssignable<RegistrationSubmitPayload, RegistrationSubmitPayloadSchema> = true;
const _premiumRegistrationSubmitFwd: AssertAssignable<PremiumRegistrationSubmitPayload, PremiumRegistrationSubmitPayloadSchema> = true;
const _registrationResultFwd: AssertAssignable<RegistrationResultPayload, RegistrationResultPayloadSchema> = true;
const _registrationRemoveFwd: AssertAssignable<RegistrationRemovePayload, RegistrationRemovePayloadSchema> = true;
const _agentQueryFwd: AssertAssignable<AgentQueryPayload, AgentQueryPayloadSchema> = true;
const _agentQueryResponseFwd: AssertAssignable<AgentQueryResponsePayload, AgentQueryResponsePayloadSchema> = true;
const _agentGetFwd: AssertAssignable<AgentGetPayload, AgentGetPayloadSchema> = true;
const _agentGetResponseFwd: AssertAssignable<AgentGetResponsePayload, AgentGetResponsePayloadSchema> = true;
const _paymentRequiredFwd: AssertAssignable<PaymentRequiredPayload, PaymentRequiredPayloadSchema> = true;
const _paymentSubmitFwd: AssertAssignable<PaymentSubmitPayload, PaymentSubmitPayloadSchema> = true;
const _paymentResultFwd: AssertAssignable<PaymentResultPayload, PaymentResultPayloadSchema> = true;
const _configRequestFwd: AssertAssignable<ConfigurationRequestPayload, ConfigurationRequestPayloadSchema> = true;
const _configResponseFwd: AssertAssignable<ConfigurationResponsePayload, ConfigurationResponsePayloadSchema> = true;
const _sourceManifestRequestFwd: AssertAssignable<SourceManifestRequestPayload, SourceManifestRequestPayloadSchema> = true;
const _sourceManifestResponseFwd: AssertAssignable<SourceManifestResponsePayload, SourceManifestResponsePayloadSchema> = true;
const _sourceChunkRequestFwd: AssertAssignable<SourceChunkRequestPayload, SourceChunkRequestPayloadSchema> = true;
const _sourceChunkResponseFwd: AssertAssignable<SourceChunkResponsePayload, SourceChunkResponsePayloadSchema> = true;
const _forkOffersRequestFwd: AssertAssignable<ForkOffersRequestPayload, ForkOffersRequestPayloadSchema> = true;
const _forkOffersResponseFwd: AssertAssignable<ForkOffersResponsePayload, ForkOffersResponsePayloadSchema> = true;
const _forkRequestFwd: AssertAssignable<ForkRequestPayload, ForkRequestPayloadSchema> = true;
const _forkResultFwd: AssertAssignable<ForkResultPayload, ForkResultPayloadSchema> = true;

// Silence "declared but never read"
export {
  _agentInfoFwd,
  _connRequestFwd,
  _connResponseFwd,
  _skillRequestFwd,
  _skillResponseFwd,
  _disconnectFwd,
  _forgetMeFwd,
  _disconnectAckFwd,
  _errorFwd,
  _registrationSubmitFwd,
  _premiumRegistrationSubmitFwd,
  _registrationResultFwd,
  _registrationRemoveFwd,
  _agentQueryFwd,
  _agentQueryResponseFwd,
  _agentGetFwd,
  _agentGetResponseFwd,
  _paymentRequiredFwd,
  _paymentSubmitFwd,
  _paymentResultFwd,
  _configRequestFwd,
  _configResponseFwd,
  _sourceManifestRequestFwd,
  _sourceManifestResponseFwd,
  _sourceChunkRequestFwd,
  _sourceChunkResponseFwd,
  _forkOffersRequestFwd,
  _forkOffersResponseFwd,
  _forkRequestFwd,
  _forkResultFwd,
};
