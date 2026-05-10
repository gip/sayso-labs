import type { NetworkAgentRecord, RegistrationSubmitPayload, SkillPacket } from "./types.js";

export type RegistrationWrite = {
  agentId: string;
  syncInboxId: string;
  walletAddress: string;
  displayName: string;
  protocolVersion: string;
  visibility: "public" | "private";
  description: string;
  skillDisclosure: "summary-only" | "include-skill-packet";
  skillPacket?: SkillPacket;
  skillIds: string[];
  capabilityIds: string[];
  claimTypes: string[];
  listingTier?: "standard" | "premium";
  extensions?: Record<string, unknown>;
  expiresAt?: Date;
  premiumExpiresAt?: Date;
};

export const extractSkillIds = (skillPacket?: SkillPacket): string[] => {
  if (!skillPacket) return [];
  const ids = new Set<string>();
  for (const skill of skillPacket.skills ?? []) ids.add(skill.skillId);
  for (const skillId of skillPacket.resolution?.includedSkillIds ?? []) ids.add(skillId);
  return [...ids].sort();
};

export const extractCapabilityIds = (skillPacket?: SkillPacket): string[] => {
  if (!skillPacket) return [];
  const ids = new Set<string>();
  for (const capability of skillPacket.skill?.capabilities ?? []) ids.add(capability.capabilityId);
  for (const document of skillPacket.skills ?? []) {
    for (const capability of document.skill?.capabilities ?? []) ids.add(capability.capabilityId);
  }
  return [...ids].sort();
};

const claimTypesBySkillId: Record<string, string[]> = {
  "sayso.claim": ["sayso.claim.agent-connection", "sayso.claim.wallet-control", "sayso.claim.world-id.wallet"],
};

export const extractClaimTypes = (skillPacket?: SkillPacket): string[] => {
  if (!skillPacket) return [];
  const claims = new Set<string>();
  for (const skillId of extractSkillIds(skillPacket)) {
    for (const claimType of claimTypesBySkillId[skillId] ?? []) claims.add(claimType);
  }
  for (const capability of skillPacket.skill?.capabilities ?? []) {
    if (typeof capability.claimType === "string" && capability.claimType.length > 0) {
      claims.add(capability.claimType);
    }
  }
  for (const document of skillPacket.skills ?? []) {
    for (const capability of document.skill?.capabilities ?? []) {
      if (typeof capability.claimType === "string" && capability.claimType.length > 0) {
        claims.add(capability.claimType);
      }
    }
  }
  return [...claims].sort();
};

export const registrationWriteFromSubmit = (payload: RegistrationSubmitPayload, walletAddress: string): RegistrationWrite => {
  const skillPacket = payload.profile?.skillDisclosure === "include-skill-packet" ? payload.profile.skillPacket : undefined;
  return {
    agentId: payload.agent.agentId,
    syncInboxId: payload.agent.syncInboxId,
    walletAddress: walletAddress.toLowerCase(),
    displayName: payload.agent.displayName,
    protocolVersion: payload.agent.protocolVersion,
    visibility: payload.visibility,
    description: payload.profile?.description ?? "Private registration",
    skillDisclosure: payload.profile?.skillDisclosure ?? "summary-only",
    ...(skillPacket ? { skillPacket } : {}),
    skillIds: extractSkillIds(skillPacket),
    capabilityIds: extractCapabilityIds(skillPacket),
    claimTypes: extractClaimTypes(skillPacket),
    ...(payload.extensions ? { extensions: payload.extensions } : {}),
    ...(payload.expiresAt ? { expiresAt: new Date(payload.expiresAt) } : {}),
  };
};

export const premiumRegistrationWriteFromSubmit = (
  payload: RegistrationSubmitPayload,
  walletAddress: string,
  premiumExpiresAt: Date,
): RegistrationWrite => ({
  ...registrationWriteFromSubmit(
    {
      ...payload,
      visibility: "public",
      expiresAt: premiumExpiresAt.toISOString(),
    },
    walletAddress,
  ),
  listingTier: "premium",
  expiresAt: premiumExpiresAt,
  premiumExpiresAt,
});

export const sanitizeRecordForPublic = (record: NetworkAgentRecord): NetworkAgentRecord => ({
  ...record,
  visibility: "public",
  ...(record.skillDisclosure === "include-skill-packet" && record.skillPacket ? { skillPacket: record.skillPacket } : { skillPacket: undefined }),
});

export const sanitizeRecordForOwner = (record: NetworkAgentRecord): NetworkAgentRecord => ({
  ...record,
  ...(record.skillDisclosure === "include-skill-packet" && record.skillPacket ? { skillPacket: record.skillPacket } : { skillPacket: undefined }),
});
