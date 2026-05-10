import type { NetworkAgentRecord, RegistrationWrite } from "@sayso-labs/protocol";

export type RegistryStats = {
  total: number;
  public: number;
  private: number;
  disclosedSkillPacket: number;
  premium: number;
};

export type ListAgentsInput = {
  query?: string;
  skillIds?: string[];
  capabilityIds?: string[];
  limit?: number;
  cursor?: string;
};

export type ListAgentsResult = {
  results: NetworkAgentRecord[];
  nextCursor?: string;
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

export type WebNetworkAgentRecord = NetworkAgentRecord & {
  skillStatuses?: RegisteredSkillStatus[];
};

export type WebListAgentsResult = {
  results: WebNetworkAgentRecord[];
  nextCursor?: string;
};

export type ClaimWrite = {
  senderInboxId: string;
  walletAddress?: string;
  claimType: string;
  status: "verified" | "failed" | "malformed" | "provider-error";
  requesterType?: string;
  requesterAddress?: string;
  agentType?: string;
  agentAddress?: string;
  signatureScheme?: string;
  canonicalMessage?: string;
  presentation?: Record<string, unknown>;
  providerResponse?: Record<string, unknown>;
  errorMessage?: string;
};

export type RegistryRepository = {
  health(): Promise<void>;
  stats(): Promise<RegistryStats>;
  listPublicAgents(input: ListAgentsInput): Promise<ListAgentsResult>;
  listPublicAgentsForWeb(input: ListAgentsInput): Promise<WebListAgentsResult>;
  getPublicAgentById(agentId: string): Promise<NetworkAgentRecord | null>;
  getPublicAgentByIdForWeb(agentId: string): Promise<WebNetworkAgentRecord | null>;
  findByAgentId(agentId: string): Promise<NetworkAgentRecord | null>;
  findByWalletAddressAndAgentId(walletAddress: string, agentId: string): Promise<NetworkAgentRecord | null>;
  findBySyncInboxId(syncInboxId: string): Promise<NetworkAgentRecord | null>;
  upsertRegistrationBySyncInbox(write: RegistrationWrite): Promise<NetworkAgentRecord>;
  upsertPremiumRegistrationBySyncInbox(write: RegistrationWrite): Promise<NetworkAgentRecord>;
  removeOwnedRegistration(input: { senderInboxId: string; agentId?: string; syncInboxId?: string }): Promise<boolean>;
  saveConnectionClaim(write: ClaimWrite): Promise<void>;
};
