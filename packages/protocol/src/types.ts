export type XmtpEnv = "local" | "dev" | "production";

export type NonEmptyArray<T> = [T, ...T[]];

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

// Schema: sayso://sayso.network/common#/$defs/summaryOnlyProfile
export type SummaryOnlyProfile = {
  description: string;
  skillDisclosure: "summary-only";
};

// Schema: sayso://sayso.network/common#/$defs/skillPacketProfile
export type SkillPacketProfile = {
  description: string;
  skillDisclosure: "include-skill-packet";
  skillPacket: SkillPacket;
};

// Schema: sayso://sayso.network/common#/$defs/privateProfile (oneOf the above)
export type RegistrationProfile = SummaryOnlyProfile | SkillPacketProfile;

// Schema: sayso://sayso.network/registration-submit/1 — 3-branch oneOf on
// visibility × profile.skillDisclosure. Branches are spelled out individually
// (not collapsed to `profile: SummaryOnly | SkillPacket`) so the drift sentinel
// against the schema-generated union holds — TS does not narrow
// `{ profile: A | B }` to `{ profile: A } | { profile: B }`.
type RegistrationSubmitBase = {
  requestId: string;
  agent: NetworkAgent;
  expiresAt?: string;
  extensions?: Record<string, unknown>;
};

type PrivateRegistrationSubmit = RegistrationSubmitBase & {
  visibility: "private";
  profile?: RegistrationProfile;
};

type PublicSummaryRegistrationSubmit = RegistrationSubmitBase & {
  visibility: "public";
  profile: SummaryOnlyProfile;
};

type PublicSkillPacketRegistrationSubmit = RegistrationSubmitBase & {
  visibility: "public";
  profile: SkillPacketProfile;
};

export type RegistrationSubmitPayload =
  | PrivateRegistrationSubmit
  | PublicSummaryRegistrationSubmit
  | PublicSkillPacketRegistrationSubmit;

// Schema: sayso://sayso.network/premium-registration-submit/1 — 2-branch oneOf
// on profile.skillDisclosure (always visibility="public"; no expiresAt).
// `agent.agentId` additionally must match /^(?!0x)[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/
// — runtime-only (Ajv-enforced); not representable in TS template literal types.
type PremiumRegistrationSubmitBase = {
  requestId: string;
  agent: NetworkAgent;
  visibility: "public";
  extensions?: Record<string, unknown>;
};

export type PremiumRegistrationSubmitPayload =
  | (PremiumRegistrationSubmitBase & { profile: SummaryOnlyProfile })
  | (PremiumRegistrationSubmitBase & { profile: SkillPacketProfile });

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

export type RegistrationRemovePayload = {
  requestId: string;
  agentId?: string;
  syncInboxId?: string;
};

export type AgentQueryPayload = {
  requestId: string;
  query?: string;
  skillIds?: string[];
  capabilityIds?: string[];
  limit?: number;
  cursor?: string;
};

export type AgentGetPayload = {
  requestId: string;
  agentId?: string;
  syncInboxId?: string;
};

export type NetworkAgentRecord = {
  registrationId: string;
  walletAddress: string;
  agent: NetworkAgent;
  visibility: "public" | "private";
  listingTier: "standard" | "premium";
  description: string;
  skillDisclosure: "summary-only" | "include-skill-packet";
  claimTypes: string[];
  connectionCount: number;
  skillPacket?: SkillPacket;
  updatedAt: string;
  expiresAt?: string;
  premiumExpiresAt?: string;
};

export type AgentQueryResponsePayload = {
  requestId: string;
  results: NetworkAgentRecord[];
  nextCursor?: string;
};

export type AgentGetResponsePayload =
  | {
      requestId: string;
      status: "found";
      result: NetworkAgentRecord;
    }
  | {
      requestId: string;
      status: "not-found";
    };

export type X402ResourceInfo = {
  url: `xmtp://${string}`;
  description?: string;
  mimeType?: string;
};

export type X402PaymentRequirements = {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
};

export type PaymentRequiredPayload = {
  requestId: string;
  x402Version: number;
  resource: X402ResourceInfo;
  accepts: NonEmptyArray<X402PaymentRequirements>;
  extensions?: Record<string, unknown>;
  reason?: string;
};

export type X402PaymentPayload = {
  x402Version: number;
  resource?: X402ResourceInfo;
  accepted: X402PaymentRequirements;
  payload: Record<string, unknown>;
  extensions?: Record<string, unknown>;
};

export type PaymentSubmitPayload = {
  requestId: string;
  payment: X402PaymentPayload;
};

export type PaymentResultPayload =
  | {
      status: "verified" | "settled";
      requestId: string;
      payer: string | null;
      transaction: string | null;
      network: string;
      extensions?: Record<string, unknown>;
    }
  | {
      status: "error";
      requestId: string;
      error: {
        code: "payment-required" | "payment-invalid" | "payment-failed" | "request-expired" | "internal";
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
  valueType?: string;
  required?: boolean;
  source?: string;
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

export type SourceManifestRequestPayload = {
  requestId: string;
  format?: "files" | "tar.gz" | "zip";
  include?: string[];
  exclude?: string[];
  maxChunkSizeBytes?: number;
};

export type SourceFileEntry = {
  path: string;
  kind: "file";
  sizeBytes: number;
  sha256: string;
  chunks: number;
  mediaType?: string;
  executable?: boolean;
};

export type SourceArchiveEntry = {
  format: "tar.gz" | "zip";
  sizeBytes: number;
  sha256: string;
  chunks: number;
  mediaType: string;
};

export type SourceManifestResponsePayload =
  | {
      requestId: string;
      status: "ok";
      snapshotId: string;
      createdAt: string;
      expiresAt?: string;
      chunkSizeBytes: number;
      files: SourceFileEntry[];
      archives?: SourceArchiveEntry[];
    }
  | {
      requestId: string;
      status: "error";
      error: {
        code: "malformed" | "not-found" | "policy" | "snapshot-expired" | "internal";
        message: string;
      };
    };

export type SourceChunkTarget =
  | {
      kind: "file";
      path: string;
    }
  | {
      kind: "archive";
      format: "tar.gz" | "zip";
    };

export type SourceChunkRequestPayload = {
  requestId: string;
  snapshotId: string;
  target: SourceChunkTarget;
  chunkIndex: number;
};

export type SourceChunkResponsePayload =
  | {
      requestId: string;
      status: "ok";
      snapshotId: string;
      target: SourceChunkTarget;
      chunkIndex: number;
      chunkCount: number;
      sha256: string;
      bytesBase64: string;
    }
  | {
      requestId: string;
      status: "error";
      error: {
        code: "malformed" | "not-found" | "policy" | "snapshot-expired" | "internal";
        message: string;
      };
    };

export type ForkProvider = {
  providerId: string;
  name?: string;
  kind?: string;
  region?: string;
  termsUri?: string;
};

export type ForkOfferPayment =
  | {
      required: false;
    }
  | {
      required: true;
      x402Version: number;
      accepts: X402PaymentRequirements[];
    };

export type ForkOffer = {
  offerId: string;
  title?: string;
  description?: string;
  durationSeconds: number;
  expiresAt?: string;
  provider: ForkProvider;
  requiredConfiguration: string[];
  payment?: ForkOfferPayment;
};

export type ForkOffersRequestPayload = {
  requestId: string;
  requestedDurationSeconds?: number;
  includePaymentRequirements?: boolean;
};

export type ForkOffersResponsePayload =
  | {
      requestId: string;
      status: "ok";
      offers: ForkOffer[];
      generatedAt?: string;
    }
  | {
      requestId: string;
      status: "error";
      error: {
        code: "malformed" | "policy" | "internal";
        message: string;
      };
    };

export type ForkConfigurationValue =
  | null
  | boolean
  | number
  | string
  | ForkConfigurationValue[]
  | { [key: string]: ForkConfigurationValue };

export type ForkConfigurationInput = {
  name: string;
  value: ForkConfigurationValue;
};

export type ForkRequestPayload = {
  requestId: string;
  offerId: string;
  configuration?: ForkConfigurationInput[];
  requester?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
};

export type ForkedAgentEndpoint = {
  agentId?: string;
  syncInboxId?: string;
  displayName?: string;
  protocolVersion?: string;
  endpointUri?: string;
};

export type ForkResultPayload =
  | {
      requestId: string;
      status: "accepted";
      forkId: string;
      offerId: string;
      provider: ForkProvider;
      validFrom: string;
      expiresAt: string;
      agent?: ForkedAgentEndpoint;
      extensions?: Record<string, unknown>;
    }
  | {
      requestId: string;
      status: "rejected";
      error: {
        code: "malformed" | "unknown-offer" | "payment-required" | "payment-invalid" | "policy" | "internal";
        message: string;
      };
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

export type SaySoNetworkPayload =
  | RegistrationSubmitPayload
  | PremiumRegistrationSubmitPayload
  | RegistrationResultPayload
  | RegistrationRemovePayload
  | AgentQueryPayload
  | AgentQueryResponsePayload
  | AgentGetPayload
  | AgentGetResponsePayload;

export type SaySoPaymentPayload = PaymentRequiredPayload | PaymentSubmitPayload | PaymentResultPayload;
export type SaySoConfigurePayload = ConfigurationRequestPayload | ConfigurationResponsePayload;
export type SaySoSourcePayload =
  | SourceManifestRequestPayload
  | SourceManifestResponsePayload
  | SourceChunkRequestPayload
  | SourceChunkResponsePayload;
export type SaySoForkPayload =
  | ForkOffersRequestPayload
  | ForkOffersResponsePayload
  | ForkRequestPayload
  | ForkResultPayload;

export type JsonPayload = SaySoCorePayload | SaySoNetworkPayload | SaySoPaymentPayload | SaySoConfigurePayload | SaySoSourcePayload | SaySoForkPayload;
export type SaySoCodecContent = JsonPayload | string;
