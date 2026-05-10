import { contentTypesAreEqual, type ContentTypeId } from "@xmtp/content-type-primitives";

export type ContentTypeKey =
  | "agentInfo"
  | "connectionRequest"
  | "connectionResponse"
  | "skillRequest"
  | "skillResponse"
  | "disconnect"
  | "forgetMe"
  | "disconnectAck"
  | "error"
  | "registrationSubmit"
  | "premiumRegistrationSubmit"
  | "registrationResult"
  | "registrationRemove"
  | "agentQuery"
  | "agentQueryResponse"
  | "agentGet"
  | "agentGetResponse"
  | "paymentRequired"
  | "paymentSubmit"
  | "paymentResult"
  | "configurationRequest"
  | "configurationResponse"
  | "sourceManifestRequest"
  | "sourceManifestResponse"
  | "sourceChunkRequest"
  | "sourceChunkResponse"
  | "forkOffersRequest"
  | "forkOffersResponse"
  | "forkRequest"
  | "forkResult";

export const SAYSO_PROTOCOL_AUTHORITY = "sayso.protocol";
export const SAYSO_NETWORK_AUTHORITY = "sayso.network";
export const SAYSO_PAYMENT_AUTHORITY = "sayso.payment";
export const SAYSO_CONFIGURE_AUTHORITY = "sayso.configure";
export const SAYSO_SOURCE_AUTHORITY = "sayso.source";
export const SAYSO_FORK_AUTHORITY = "sayso.fork";

export const makeContentType = (
  authorityId: string,
  typeId: string,
  versionMajor = 1,
  versionMinor = 0,
): ContentTypeId => ({
  authorityId,
  typeId,
  versionMajor,
  versionMinor,
});

export const CONTENT_TYPES = {
  agentInfo: makeContentType(SAYSO_PROTOCOL_AUTHORITY, "agent-info"),
  connectionRequest: makeContentType(SAYSO_PROTOCOL_AUTHORITY, "connection-request"),
  connectionResponse: makeContentType(SAYSO_PROTOCOL_AUTHORITY, "connection-response"),
  skillRequest: makeContentType(SAYSO_PROTOCOL_AUTHORITY, "skill-request"),
  skillResponse: makeContentType(SAYSO_PROTOCOL_AUTHORITY, "skill-response"),
  disconnect: makeContentType(SAYSO_PROTOCOL_AUTHORITY, "disconnect"),
  forgetMe: makeContentType(SAYSO_PROTOCOL_AUTHORITY, "forget-me"),
  disconnectAck: makeContentType(SAYSO_PROTOCOL_AUTHORITY, "disconnect-ack"),
  error: makeContentType(SAYSO_PROTOCOL_AUTHORITY, "error"),
  registrationSubmit: makeContentType(SAYSO_NETWORK_AUTHORITY, "registration-submit"),
  premiumRegistrationSubmit: makeContentType(SAYSO_NETWORK_AUTHORITY, "premium-registration-submit"),
  registrationResult: makeContentType(SAYSO_NETWORK_AUTHORITY, "registration-result"),
  registrationRemove: makeContentType(SAYSO_NETWORK_AUTHORITY, "registration-remove"),
  agentQuery: makeContentType(SAYSO_NETWORK_AUTHORITY, "agent-query"),
  agentQueryResponse: makeContentType(SAYSO_NETWORK_AUTHORITY, "agent-query-response"),
  agentGet: makeContentType(SAYSO_NETWORK_AUTHORITY, "agent-get"),
  agentGetResponse: makeContentType(SAYSO_NETWORK_AUTHORITY, "agent-get-response"),
  paymentRequired: makeContentType(SAYSO_PAYMENT_AUTHORITY, "payment-required"),
  paymentSubmit: makeContentType(SAYSO_PAYMENT_AUTHORITY, "payment-submit"),
  paymentResult: makeContentType(SAYSO_PAYMENT_AUTHORITY, "payment-result"),
  configurationRequest: makeContentType(SAYSO_CONFIGURE_AUTHORITY, "configuration-request"),
  configurationResponse: makeContentType(SAYSO_CONFIGURE_AUTHORITY, "configuration-response"),
  sourceManifestRequest: makeContentType(SAYSO_SOURCE_AUTHORITY, "source-manifest-request"),
  sourceManifestResponse: makeContentType(SAYSO_SOURCE_AUTHORITY, "source-manifest-response"),
  sourceChunkRequest: makeContentType(SAYSO_SOURCE_AUTHORITY, "source-chunk-request"),
  sourceChunkResponse: makeContentType(SAYSO_SOURCE_AUTHORITY, "source-chunk-response"),
  forkOffersRequest: makeContentType(SAYSO_FORK_AUTHORITY, "fork-offers-request"),
  forkOffersResponse: makeContentType(SAYSO_FORK_AUTHORITY, "fork-offers-response"),
  forkRequest: makeContentType(SAYSO_FORK_AUTHORITY, "fork-request"),
  forkResult: makeContentType(SAYSO_FORK_AUTHORITY, "fork-result"),
} as const satisfies Record<ContentTypeKey, ContentTypeId>;

export const contentTypeKey = (contentType?: ContentTypeId): ContentTypeKey | null => {
  if (!contentType) return null;
  for (const [key, value] of Object.entries(CONTENT_TYPES) as Array<[ContentTypeKey, ContentTypeId]>) {
    if (contentTypesAreEqual(contentType, value) && contentType.versionMajor === value.versionMajor) {
      return key;
    }
  }
  return null;
};

export const contentTypeName = (contentType: ContentTypeId) =>
  `${contentType.authorityId}/${contentType.typeId}/${contentType.versionMajor}`;

export const contentTypeNameFromKey = (key: ContentTypeKey) => contentTypeName(CONTENT_TYPES[key]);
