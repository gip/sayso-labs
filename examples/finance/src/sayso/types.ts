export type XmtpEnv = "local" | "dev" | "production";

export type ProtocolError = {
  code:
    | "unknown-type"
    | "malformed"
    | "request-expired"
    | "not-supported"
    | "not-connected"
    | "presentation-unsupported"
    | "presentation-malformed"
    | "presentation-verification-failed"
    | "conflict"
    | "internal";
  message: string;
};

export type ClaimPresentation = {
  type: string;
  payload: Record<string, unknown>;
};

export type ConnectionRequestPayload = {
  presentations?: ClaimPresentation[];
};

export type VerifiedClaim = {
  type: string;
  subject?: Record<string, unknown>;
  status: "verified";
  verifiedAt: string;
  expiresAt?: string;
  issuer?: string;
  payload?: Record<string, unknown>;
};

export type AgentInfo = {
  agentId: string;
  syncInboxId: string;
  displayName: string;
};

export type SkillPacketAgent = AgentInfo & {
  kind: string;
  protocolVersion: string;
};

export type SkillPacket = {
  agent: SkillPacketAgent;
  skill: AgentSkillContract;
  skills: SaySoSkillDocument[];
  resolution: SkillResolution;
  content: string;
  mediaType: string;
};

export type AgentInfoPayload = {
  protocolVersion: string;
  supportedProtocolVersions: string[];
  agent: AgentInfo;
  fallbackText: string;
  skillPacket: SkillPacket;
};

export type ConnectionResponsePayload =
  | {
      status: "ok";
      protocolVersion: string;
      supportedProtocolVersions: string[];
      agent: AgentInfo;
      next: "sayso.protocol/skill-request/1" | string;
      skillPacket: SkillPacket;
      verifiedClaims?: VerifiedClaim[];
    }
  | {
      status: "error";
      supportedProtocolVersions?: string[];
      error: ProtocolError;
    };

export type SkillRequestPayload = {
  include?: "resolved" | "skills" | "all";
  skillIds?: string[];
  maxDepth?: number;
};

export type AgentContentType = {
  authorityId: string;
  typeId: string;
  versionMajor: number;
  versionMinor?: number;
  purpose: string;
  channel?: string;
};

export type AgentChannel = {
  channelId: string;
  kind: string;
  description: string;
  inboxId?: string;
  conversationId?: string;
  contentTypes?: string[];
};

export type AgentCapability = {
  capabilityId: string;
  title: string;
  description: string;
  requestContentTypes: string[];
  responseContentTypes: string[];
  channels: string[];
  paymentPolicy: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  [extension: string]: unknown;
};

export type AgentPaymentPolicy = {
  policyId: string;
  capabilityIds: string[];
  required: boolean;
  terms: Record<string, unknown>;
};

export type AgentSkillContract = {
  capabilities: AgentCapability[];
  contentTypes: AgentContentType[];
  channels: AgentChannel[];
  paymentPolicies: AgentPaymentPolicy[];
  [extension: string]: unknown;
};

export type SkillImport = {
  skillId: string;
  version: string;
  required?: boolean;
};

export type SaySoSkillDocument = {
  skillId: string;
  name: string;
  version: string;
  kind: string;
  imports: SkillImport[];
  skill: AgentSkillContract;
  content: string;
  mediaType: string;
};

export type SkillResolution = {
  mode: "resolved" | "skills" | "all";
  requestedSkillIds?: string[];
  includedSkillIds: string[];
  dependencyOrder: string[];
};

export type SkillResponsePayload =
  | ({ status: "ok" } & Omit<SkillPacket, "skills" | "resolution"> & {
      skills?: SaySoSkillDocument[];
      resolution?: SkillResolution;
    })
  | {
      status: "error";
      error: ProtocolError;
    };

export type DisconnectPayload = {
  reason?: string;
};

export type ForgetMePayload = {
  reason?: string;
};

export type DisconnectAckPayload = {
  action: "disconnect" | "forget-me";
  status: "ok" | "partial" | "error";
  details?: Record<string, unknown>;
  error?: ProtocolError;
};

export type ErrorPayload = ProtocolError & {
  requestId?: string;
};

export type NetworkAgent = AgentInfo & {
  protocolVersion: string;
};

export type RegistrationSubmitPayload = {
  requestId: string;
  agent: NetworkAgent;
  visibility: "private" | "public";
  profile?: {
    description?: string;
    skillDisclosure: "summary-only" | "include-skill-packet";
    skillPacket?: SkillPacket;
  };
  expiresAt?: string;
  extensions?: Record<string, unknown>;
};

export type RegistrationResultPayload =
  | {
      requestId: string;
      status: "accepted";
      registrationId: string;
      visibility: "private" | "public";
      updatedAt: string;
    }
  | {
      requestId: string;
      status: "rejected";
      error: {
        code: "sender-mismatch" | "malformed" | "unsupported" | "policy" | "internal";
        message: string;
      };
    };

export type ConfigurationValue =
  | null
  | boolean
  | number
  | string
  | ConfigurationValue[]
  | { [key: string]: ConfigurationValue };

export type ConfigurationVariable = {
  name: string;
  visibility: "public" | "private";
  description?: string;
  valueType?: "string" | "number" | "boolean" | "json" | "url" | "secret" | string;
  required?: boolean;
  source?: "environment" | "runtime" | "default" | "secret-store" | string;
  value?: ConfigurationValue;
};

export type ConfigurationRequestPayload = {
  requestId: string;
  names?: string[];
  includeValues?: "public" | "none";
};

export type ConfigurationResponsePayload =
  | {
      requestId: string;
      status: "ok";
      variables: ConfigurationVariable[];
      generatedAt?: string;
    }
  | {
      requestId: string;
      status: "error";
      error: {
        code: "malformed" | "not-found" | "policy" | "internal";
        message: string;
      };
    };

export type SpotPriceRequestPayload = {
  requestId: string;
  markets: string[];
};

export type SpotPriceResult =
  | {
      requestedMarket: string;
      productId: string;
      status: "ok";
      price: string;
      bestBid?: string;
      bestAsk?: string;
      asOf: string;
      source: "coinbase.websocket.ticker";
      sequenceNum?: number;
    }
  | {
      requestedMarket: string;
      productId?: string;
      status: "error";
      error: {
        code: "unsupported-market" | "stale-or-unavailable";
        message: string;
      };
    };

export type SpotPriceResponsePayload = {
  requestId: string;
  status: "ok";
  generatedAt: string;
  results: SpotPriceResult[];
};

export type SaySoCorePayload =
  | AgentInfoPayload
  | ConnectionRequestPayload
  | ConnectionResponsePayload
  | SkillRequestPayload
  | SkillResponsePayload
  | DisconnectPayload
  | ForgetMePayload
  | DisconnectAckPayload
  | ErrorPayload;

export type SaySoConfigurePayload = ConfigurationRequestPayload | ConfigurationResponsePayload;
export type SaySoOraclePayload = SpotPriceRequestPayload | SpotPriceResponsePayload;
export type SaySoNetworkPayload = RegistrationSubmitPayload | RegistrationResultPayload;
