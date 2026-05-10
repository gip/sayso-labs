export const SAYSO_NETWORK_SERVICE_ID = "sayso-network";
export const SAYSO_NETWORK_REGISTRY_AGENT_ID = "sayso-network-registry";

export type SaySoNetworkServiceKind = "network-api";

export type SaySoNetworkServiceDescriptor = {
  serviceId: typeof SAYSO_NETWORK_SERVICE_ID;
  kind: SaySoNetworkServiceKind;
  publicHttps: boolean;
  xmtpRegistryAgent: boolean;
};

export const saysoNetworkServiceDescriptor: SaySoNetworkServiceDescriptor = {
  serviceId: SAYSO_NETWORK_SERVICE_ID,
  kind: "network-api",
  publicHttps: true,
  xmtpRegistryAgent: true,
};
