import type { SkillPacket } from "@sayso-labs/protocol/browser";

export type RegistryStats = {
  total: number;
  public: number;
  private: number;
  disclosedSkillPacket: number;
  premium: number;
};

export type RegistryEnvironment = "dev" | "production";

export type RegistryEnvironmentResponse = {
  defaultEnvironment: RegistryEnvironment;
  environments: RegistryEnvironment[];
};

export type NetworkAgentRecord = {
  registrationId: string;
  walletAddress: string;
  agent: {
    agentId: string;
    syncInboxId: string;
    displayName: string;
    protocolVersion: string;
  };
  visibility: "public" | "private";
  listingTier: "standard" | "premium";
  description: string;
  skillDisclosure: "summary-only" | "include-skill-packet";
  claimTypes?: string[];
  connectionCount: number;
  skillPacket?: SkillPacket;
  skillStatuses?: RegisteredSkillStatus[];
  updatedAt: string;
  expiresAt?: string;
  premiumExpiresAt?: string;
};

export type RegisteredSkillStatus = {
  name: string;
  skillId: string;
  version: string;
  displayName: string;
  sha256: string;
  status: "reference" | "modified" | "custom";
  referenceSha256?: string;
};

export type AgentListResponse = {
  results: NetworkAgentRecord[];
  nextCursor?: string;
};
