export const SAYSO_PROTOCOL_VERSION = "0.1.0";
export const SAYSO_NETWORK_VERSION = "0.1.0";
export const SAYSO_PAYMENT_VERSION = "0.1.0";
export const SAYSO_WORLD_ID_ACTION = "human";

export const PRE_CONNECTION_EXPLANATION =
  'This agent speaks SaySo. This message is sayso.protocol/agent-info/1, an XMTP custom content type carrying the current skill packet plus this fallback text. To connect or refresh skills, send an XMTP custom content type with authorityId="sayso.protocol", typeId="connection-request", versionMajor=1, versionMinor=0, encoded as UTF-8 JSON payload {} or a payload with skill-defined claim presentations. The agent will reply with sayso.protocol/connection-response/1 including protocolVersion, verifiedClaims when applicable, and the current skillPacket.';
