import type {
  ClaimWrite,
  ListAgentsInput,
  ListAgentsResult,
  RegistryRepository,
  RegistryStats,
  WebListAgentsResult,
  WebNetworkAgentRecord,
} from "@sayso-labs/db-postgres";
import { referenceSkillStatuses } from "@sayso-labs/db-postgres";
import type { NetworkAgentRecord, RegistrationWrite } from "@sayso-labs/protocol";

export class FakeRegistryRepository implements RegistryRepository {
  readonly records = new Map<string, NetworkAgentRecord>();
  readonly claims: ClaimWrite[] = [];

  private connectionCountFor(walletAddress: string) {
    const pairs = new Set<string>();
    for (const claim of this.claims) {
      if (
        claim.claimType !== "sayso.claim.agent-connection" ||
        claim.status !== "verified" ||
        !claim.requesterType ||
        !claim.requesterAddress ||
        !claim.agentAddress ||
        claim.agentAddress.toLowerCase() !== walletAddress.toLowerCase()
      ) {
        continue;
      }
      pairs.add(`${claim.requesterType.toLowerCase()}:${claim.requesterAddress.toLowerCase()}`);
    }
    return pairs.size;
  }

  private withConnectionCount(record: NetworkAgentRecord): NetworkAgentRecord {
    const activePremium = record.listingTier === "premium" &&
      record.premiumExpiresAt !== undefined &&
      new Date(record.premiumExpiresAt).getTime() > Date.now();
    const listingTier: NetworkAgentRecord["listingTier"] = activePremium ? "premium" : "standard";
    return {
      ...record,
      listingTier,
      connectionCount: this.connectionCountFor(record.walletAddress),
    };
  }

  private withSkillStatuses(record: NetworkAgentRecord): WebNetworkAgentRecord {
    const skillStatuses = record.skillPacket?.skills ? referenceSkillStatuses(record.skillPacket.skills) : undefined;
    return {
      ...record,
      ...(skillStatuses?.length ? { skillStatuses } : {}),
    };
  }

  async health() {}

  async stats(): Promise<RegistryStats> {
    const records = [...this.records.values()];
    return {
      total: records.length,
      public: records.filter((record) => record.visibility === "public").length,
      private: records.filter((record) => record.visibility === "private").length,
      disclosedSkillPacket: records.filter((record) => record.skillDisclosure === "include-skill-packet").length,
      premium: records.filter((record) => record.listingTier === "premium" && record.premiumExpiresAt && new Date(record.premiumExpiresAt).getTime() > Date.now()).length,
    };
  }

  async listPublicAgents(input: ListAgentsInput): Promise<ListAgentsResult> {
    const results = [...this.records.values()].filter((record) => {
      if (record.visibility !== "public") return false;
      if (input.query && !`${record.agent.agentId} ${record.agent.displayName} ${record.description}`.toLowerCase().includes(input.query.toLowerCase())) return false;
      const skillIds = record.skillPacket?.skills.map((skill) => skill.skillId) ?? [];
      if (input.skillIds?.some((skillId) => !skillIds.includes(skillId))) return false;
      const capabilityIds = record.skillPacket?.skill.capabilities.map((capability) => capability.capabilityId) ?? [];
      if (input.capabilityIds?.some((capabilityId) => !capabilityIds.includes(capabilityId))) return false;
      return true;
    }).sort((left, right) => {
      if (left.listingTier !== right.listingTier) return left.listingTier === "premium" ? -1 : 1;
      return right.updatedAt.localeCompare(left.updatedAt);
    });
    return { results: results.slice(0, input.limit ?? 25).map((record) => this.withConnectionCount(record)) };
  }

  async listPublicAgentsForWeb(input: ListAgentsInput): Promise<WebListAgentsResult> {
    const page = await this.listPublicAgents(input);
    return { ...page, results: page.results.map((record) => this.withSkillStatuses(record)) };
  }

  async getPublicAgentById(agentId: string) {
    const record = await this.findByAgentId(agentId);
    return record?.visibility === "public" ? this.withConnectionCount(record) : null;
  }

  async getPublicAgentByIdForWeb(agentId: string) {
    const record = await this.getPublicAgentById(agentId);
    return record ? this.withSkillStatuses(record) : null;
  }

  async findByAgentId(agentId: string) {
    const record = [...this.records.values()].find((record) => record.agent.agentId === agentId) ?? null;
    return record ? this.withConnectionCount(record) : null;
  }

  async findByWalletAddressAndAgentId(walletAddress: string, agentId: string) {
    const record = [...this.records.values()].find((record) =>
      record.walletAddress.toLowerCase() === walletAddress.toLowerCase() &&
      record.agent.agentId === agentId,
    ) ?? null;
    return record ? this.withConnectionCount(record) : null;
  }

  async findBySyncInboxId(syncInboxId: string) {
    const record = this.records.get(syncInboxId) ?? null;
    return record ? this.withConnectionCount(record) : null;
  }

  async upsertRegistrationBySyncInbox(write: RegistrationWrite) {
    const now = new Date().toISOString();
    const existing = this.records.get(write.syncInboxId);
    const record: NetworkAgentRecord = {
      registrationId: existing?.registrationId ?? `reg_${write.syncInboxId}`,
      walletAddress: write.walletAddress,
      agent: {
        agentId: write.agentId,
        syncInboxId: write.syncInboxId,
        displayName: write.displayName,
        protocolVersion: write.protocolVersion,
      },
      visibility: write.visibility,
      listingTier: write.listingTier ?? existing?.listingTier ?? "standard",
      description: write.description,
      skillDisclosure: write.skillDisclosure,
      claimTypes: write.claimTypes,
      connectionCount: 0,
      ...(write.skillPacket ? { skillPacket: write.skillPacket } : {}),
      updatedAt: now,
      ...(write.expiresAt ? { expiresAt: write.expiresAt.toISOString() } : {}),
      ...(write.premiumExpiresAt ? { premiumExpiresAt: write.premiumExpiresAt.toISOString() } : existing?.premiumExpiresAt ? { premiumExpiresAt: existing.premiumExpiresAt } : {}),
    };
    this.records.set(write.syncInboxId, record);
    return record;
  }

  async upsertPremiumRegistrationBySyncInbox(write: RegistrationWrite) {
    for (const [syncInboxId, record] of this.records) {
      if (
        syncInboxId !== write.syncInboxId &&
        record.agent.agentId === write.agentId &&
        record.expiresAt &&
        new Date(record.expiresAt).getTime() <= Date.now()
      ) {
        this.records.delete(syncInboxId);
      }
    }
    return this.upsertRegistrationBySyncInbox({ ...write, listingTier: "premium" });
  }

  async removeOwnedRegistration(input: { senderInboxId: string; agentId?: string; syncInboxId?: string }) {
    const key = input.syncInboxId ?? input.senderInboxId;
    const record = this.records.get(key);
    if (!record || record.agent.syncInboxId !== input.senderInboxId) return false;
    if (input.agentId && input.agentId !== record.agent.agentId) return false;
    this.records.delete(key);
    return true;
  }

  async saveConnectionClaim(write: ClaimWrite) {
    if (
      write.status === "verified" &&
      write.claimType === "sayso.claim.agent-connection" &&
      write.requesterType &&
      write.requesterAddress &&
      write.agentType &&
      write.agentAddress
    ) {
      const index = this.claims.findIndex((claim) =>
        claim.status === "verified" &&
        claim.claimType === write.claimType &&
        claim.requesterType?.toLowerCase() === write.requesterType?.toLowerCase() &&
        claim.requesterAddress?.toLowerCase() === write.requesterAddress?.toLowerCase() &&
        claim.agentType?.toLowerCase() === write.agentType?.toLowerCase() &&
        claim.agentAddress?.toLowerCase() === write.agentAddress?.toLowerCase(),
      );
      if (index >= 0) {
        this.claims[index] = write;
        return;
      }
    }
    this.claims.push(write);
  }
}
