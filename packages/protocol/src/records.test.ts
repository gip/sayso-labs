import { describe, expect, it } from "vitest";
import { createNetworkSkillPacket } from "./networkSkill.js";
import { extractCapabilityIds, extractClaimTypes, extractSkillIds, registrationWriteFromSubmit, sanitizeRecordForPublic } from "./records.js";
import type { NetworkAgentRecord, RegistrationSubmitPayload } from "./types.js";

describe("network record helpers", () => {
  it("extracts skill and capability ids from disclosed skill packets", () => {
    const packet = createNetworkSkillPacket({
      agentId: "registry",
      syncInboxId: "inbox_registry",
      displayName: "Registry",
    });

    expect(extractSkillIds(packet)).toContain("sayso.network");
    expect(extractCapabilityIds(packet)).toContain("sayso.network.search");
    expect(extractClaimTypes(packet)).toContain("sayso.claim.world-id.wallet");
    expect(extractClaimTypes(packet)).toContain("sayso.claim.agent-connection");
  });

  it("derives writes from registration submissions", () => {
    const packet = createNetworkSkillPacket({
      agentId: "agent_public",
      syncInboxId: "inbox_public",
      displayName: "Public",
    });
    const submit: RegistrationSubmitPayload = {
      requestId: "req_1",
      agent: {
        agentId: "agent_public",
        syncInboxId: "inbox_public",
        displayName: "Public",
        protocolVersion: "0.1.0",
      },
      visibility: "public",
      profile: {
        description: "Public agent",
        skillDisclosure: "include-skill-packet",
        skillPacket: packet,
      },
    };

    const write = registrationWriteFromSubmit(submit, "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD");

    expect(write.walletAddress).toBe("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");
    expect(write.skillDisclosure).toBe("include-skill-packet");
    expect(write.skillIds).toContain("sayso.network");
    expect(write.capabilityIds).toContain("sayso.network.register");
    expect(write.claimTypes).toContain("sayso.claim.world-id.wallet");
    expect(write.claimTypes).toContain("sayso.claim.agent-connection");
  });

  it("does not expose summary-only skill packets", () => {
    const record: NetworkAgentRecord = {
      registrationId: "reg_1",
      walletAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      agent: {
        agentId: "agent_public",
        syncInboxId: "inbox_public",
        displayName: "Public",
        protocolVersion: "0.1.0",
      },
      visibility: "public",
      listingTier: "standard",
      description: "Public agent",
      skillDisclosure: "summary-only",
      claimTypes: [],
      connectionCount: 0,
      skillPacket: createNetworkSkillPacket({
        agentId: "agent_public",
        syncInboxId: "inbox_public",
        displayName: "Public",
      }),
      updatedAt: new Date().toISOString(),
    };

    expect(sanitizeRecordForPublic(record).skillPacket).toBeUndefined();
  });
});
