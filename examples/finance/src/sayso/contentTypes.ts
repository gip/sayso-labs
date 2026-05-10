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
  | "registrationResult"
  | "configurationRequest"
  | "configurationResponse"
  | "spotPriceRequest"
  | "spotPriceResponse";

export const SAYSO_PROTOCOL_AUTHORITY = "sayso.protocol";
export const SAYSO_NETWORK_AUTHORITY = "sayso.network";
export const SAYSO_CONFIGURE_AUTHORITY = "sayso.configure";
export const SAYSO_ORACLE_AUTHORITY = "sayso.finance.oracle";

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
  registrationResult: makeContentType(SAYSO_NETWORK_AUTHORITY, "registration-result"),
  configurationRequest: makeContentType(SAYSO_CONFIGURE_AUTHORITY, "configuration-request"),
  configurationResponse: makeContentType(SAYSO_CONFIGURE_AUTHORITY, "configuration-response"),
  spotPriceRequest: makeContentType(SAYSO_ORACLE_AUTHORITY, "spot-price-request"),
  spotPriceResponse: makeContentType(SAYSO_ORACLE_AUTHORITY, "spot-price-response"),
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

export const contentTypeNameFromKey = (key: ContentTypeKey) =>
  contentTypeName(CONTENT_TYPES[key]);

export const contentTypeFromName = (name: string): ContentTypeId | null => {
  const [authorityId, typeId, version] = name.split("/");
  const versionMajor = Number(version);
  if (!authorityId || !typeId || !Number.isInteger(versionMajor)) return null;
  return makeContentType(authorityId, typeId, versionMajor);
};
