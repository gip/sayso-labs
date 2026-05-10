import { describe, expect, it, vi } from "vitest";
import { createNetworkSkillPacket, protocolSkillDocument, type PremiumRegistrationSubmitPayload, type RegistrationSubmitPayload } from "@sayso-labs/protocol";
import { privateKeyToAccount } from "viem/accounts";
import { canonicalJson } from "./agentConnection.js";
import type { PaymentVerifier, PremiumRegistrationPaymentConfig } from "./payment.js";
import { RegistryService } from "./service.js";
import { FakeRegistryRepository } from "../test/fakeRepository.js";

const premiumRegistration: PremiumRegistrationPaymentConfig = {
  enabled: true,
  x402Version: 1,
  paymentOptions: [
    {
      scheme: "exact",
      network: "eip155:8453",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      amount: "100000",
      payTo: "0x1111111111111111111111111111111111111111",
      extra: { name: "USDC", decimals: 6, chain: "Base" },
    },
    {
      scheme: "exact",
      network: "xrpl:mainnet",
      asset: "RLUSD:rIssuerAddress",
      amount: "100000",
      payTo: "rRegistryPayeeAddress",
      extra: { name: "RLUSD", decimals: 6, chain: "XRPL" },
    },
  ],
  maxTimeoutSeconds: 300,
  termSeconds: 3600,
};

const createService = () => {
  const repository = new FakeRegistryRepository();
  const service = new RegistryService(repository, {
    agentId: "sayso-network-registry",
    displayName: "SaySo Network Registry",
    syncInboxId: "inbox_registry",
    worldIdVerifyEnabled: false,
  });
  return { repository, service };
};

const createWorldIdService = () => {
  const repository = new FakeRegistryRepository();
  const service = new RegistryService(repository, {
    agentId: "sayso-network-registry",
    displayName: "SaySo Network Registry",
    syncInboxId: "inbox_registry",
    worldIdVerifyEnabled: true,
    worldIdVerifier: {
      rpId: "rp_test",
      action: "human",
      verifyBaseUrl: "https://developer.world.org/api/v4/verify",
    },
  });
  return { repository, service };
};

const createPremiumService = () => {
  const repository = new FakeRegistryRepository();
  const verify = vi.fn<PaymentVerifier["verify"]>(async ({ submit }) => ({
    status: "settled",
    requestId: submit.requestId,
    payer: "0x2222222222222222222222222222222222222222",
    transaction: "0x3333333333333333333333333333333333333333333333333333333333333333",
    network: submit.payment.accepted.network,
  }));
  const verifier: PaymentVerifier = {
    verify,
  };
  const service = new RegistryService(repository, {
    agentId: "sayso-network-registry",
    displayName: "SaySo Network Registry",
    syncInboxId: "inbox_registry",
    worldIdVerifyEnabled: false,
    premiumRegistration,
  }, verifier);
  return { repository, service, verifier };
};

const worldIdAttachment = (overrides: Record<string, unknown> = {}) => ({
  type: "sayso.claim.world-id.wallet",
  payload: {
    wallet: {
      type: "ethereum",
      address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    },
    version: "world-id-4",
    proofType: "uniqueness",
    rpId: "rp_test",
    action: "human",
    idkitResponse: { proof: "proof" },
    ...overrides,
  },
});

const requesterAccount = privateKeyToAccount("0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
const agentAddress = "0x1234567890123456789012345678901234567890";

const agentConnectionAttachment = async (overrides: {
  message?: Record<string, unknown>;
  signature?: string;
  signatureScheme?: string;
  requesterAddress?: string;
  requesterType?: string;
  agentAddress?: string;
  agentType?: string;
} = {}) => {
  const message = {
    claim: "I want to connect to this SaySo agent",
    requester: {
      type: overrides.requesterType ?? "ethereum",
      address: overrides.requesterAddress ?? requesterAccount.address,
    },
    agent: {
      type: overrides.agentType ?? "ethereum",
      address: overrides.agentAddress ?? agentAddress,
    },
    timestamp: "2026-05-02T00:00:00Z",
    ...overrides.message,
  };
  const signature = overrides.signature ?? await requesterAccount.signMessage({ message: canonicalJson(message) });
  return {
    type: "sayso.claim.agent-connection",
    payload: {
      message,
      signatures: [
        {
          type: overrides.requesterType ?? "ethereum",
          address: overrides.requesterAddress ?? requesterAccount.address,
          signatureScheme: overrides.signatureScheme ?? "eip191",
          signature,
        },
      ],
    },
  };
};

const sender = (senderInboxId = "inbox_public", walletAddress = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd") => ({
  senderInboxId,
  walletAddress,
});

const publicSubmit = (overrides: Partial<RegistrationSubmitPayload> = {}): RegistrationSubmitPayload => ({
  requestId: "req_1",
  agent: {
    agentId: "agent_public",
    syncInboxId: "inbox_public",
    displayName: "Public Agent",
    protocolVersion: "0.1.0",
  },
  visibility: "public",
  profile: {
    description: "A public SaySo agent",
    skillDisclosure: "include-skill-packet",
    skillPacket: createNetworkSkillPacket({
      agentId: "agent_public",
      syncInboxId: "inbox_public",
      displayName: "Public Agent",
    }),
  },
  ...overrides,
});

const premiumSubmit = (agentId = "premium-agent"): PremiumRegistrationSubmitPayload => ({
  requestId: `premium_${agentId}`,
  agent: {
    agentId,
    syncInboxId: "inbox_public",
    displayName: "Premium Agent",
    protocolVersion: "0.1.0",
  },
  visibility: "public",
  profile: {
    description: "A premium public SaySo agent",
    skillDisclosure: "summary-only",
  },
});

const paymentSubmitFor = (required: Awaited<ReturnType<RegistryService["preparePremiumRegistration"]>>) => {
  if (!("accepts" in required)) throw new Error("Expected payment-required response.");
  const accepted = required.accepts[0];
  if (!accepted) throw new Error("Expected at least one payment requirement.");
  return {
    requestId: required.requestId,
    payment: {
      x402Version: required.x402Version,
      resource: required.resource,
      accepted,
      payload: { authorization: "0xpaymentpayload" },
    },
  };
};

describe("RegistryService", () => {
  it("verifies and stores sayso.claim.agent-connection presentations", async () => {
    const { repository, service } = createService();

    const result = await service.handleConnectionRequest(sender("inbox_agent", agentAddress), [
      await agentConnectionAttachment(),
    ]);

    expect(result.status).toBe("ok");
    expect(result.status === "ok" ? result.verifiedClaims?.[0] : undefined).toMatchObject({
      type: "sayso.claim.agent-connection",
      subject: {
        type: "ethereum",
        address: requesterAccount.address,
      },
      status: "verified",
    });
    expect(repository.claims).toContainEqual(expect.objectContaining({
      senderInboxId: "inbox_agent",
      walletAddress: agentAddress,
      claimType: "sayso.claim.agent-connection",
      status: "verified",
      requesterAddress: requesterAccount.address,
      agentAddress,
      signatureScheme: "eip191",
    }));
  });

  it("counts unique verified agent connections by registered wallet address", async () => {
    const { service } = createService();
    await service.register(sender("inbox_agent", agentAddress), publicSubmit({
      agent: {
        agentId: "agent_public",
        syncInboxId: "inbox_agent",
        displayName: "Public Agent",
        protocolVersion: "0.1.0",
      },
    }));
    await service.handleConnectionRequest(sender("inbox_agent", agentAddress), [
      await agentConnectionAttachment(),
    ]);
    await service.handleConnectionRequest(sender("inbox_agent", agentAddress), [
      await agentConnectionAttachment(),
    ]);

    const response = await service.get("random", { requestId: "get_1", agentId: "agent_public" });

    expect(response.status).toBe("found");
    if (response.status === "found") expect(response.result.connectionCount).toBe(1);
  });

  it("rejects invalid sayso.claim.agent-connection signatures", async () => {
    const { repository, service } = createService();

    const result = await service.handleConnectionRequest(sender("inbox_agent", agentAddress), [
      await agentConnectionAttachment({ signature: await requesterAccount.signMessage({ message: "wrong message" }) }),
    ]);

    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.error.code).toBe("presentation-verification-failed");
    expect(repository.claims[0]).toMatchObject({
      claimType: "sayso.claim.agent-connection",
      status: "failed",
      errorMessage: "Agent connection signature could not be verified.",
    });
  });

  it("rejects malformed sayso.claim.agent-connection presentations", async () => {
    const { repository, service } = createService();
    const presentation = await agentConnectionAttachment();
    delete (presentation.payload.message as { requester?: unknown }).requester;

    const result = await service.handleConnectionRequest(sender("inbox_agent", agentAddress), [presentation]);

    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.error.code).toBe("presentation-malformed");
    expect(repository.claims[0]).toMatchObject({
      claimType: "sayso.claim.agent-connection",
      status: "malformed",
    });
  });

  it("rejects unsupported sayso.claim.agent-connection signature schemes", async () => {
    const { repository, service } = createService();

    const result = await service.handleConnectionRequest(sender("inbox_agent", agentAddress), [
      await agentConnectionAttachment({ signatureScheme: "eip712" }),
    ]);

    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.error.code).toBe("presentation-unsupported");
    expect(repository.claims).toHaveLength(0);
  });

  it("verifies and stores sayso.claim.world-id.wallet connection presentations", async () => {
    const { repository, service } = createWorldIdService();
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ success: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await service.handleConnectionRequest(sender(), [worldIdAttachment()]);

    expect(result.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledWith("https://developer.world.org/api/v4/verify/rp_test", expect.any(Object));
    expect(result.status === "ok" ? result.verifiedClaims?.[0] : undefined).toMatchObject({
      type: "sayso.claim.world-id.wallet",
      subject: {
        type: "ethereum",
        address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      },
      status: "verified",
      issuer: "world.org",
    });
    expect(repository.claims).toContainEqual(expect.objectContaining({
      senderInboxId: "inbox_public",
      walletAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      claimType: "sayso.claim.world-id.wallet",
      status: "verified",
    }));
    vi.unstubAllGlobals();
  });

  it("rejects sayso.claim.world-id.wallet presentations for the wrong RP", async () => {
    const { repository, service } = createWorldIdService();

    const result = await service.handleConnectionRequest(sender(), [worldIdAttachment({ rpId: "rp_other" })]);

    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.error.code).toBe("presentation-malformed");
    expect(repository.claims[0]).toMatchObject({
      senderInboxId: "inbox_public",
      walletAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      claimType: "sayso.claim.world-id.wallet",
      status: "malformed",
    });
  });

  it("rejects failed World ID provider verification", async () => {
    const { repository, service } = createWorldIdService();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => Response.json({ success: false, detail: "invalid proof" }, { status: 400 })));

    const result = await service.handleConnectionRequest(sender(), [worldIdAttachment()]);

    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.error.code).toBe("presentation-verification-failed");
    expect(repository.claims[0]).toMatchObject({
      senderInboxId: "inbox_public",
      walletAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      claimType: "sayso.claim.world-id.wallet",
      status: "failed",
      errorMessage: "invalid proof",
    });
    vi.unstubAllGlobals();
  });

  it("rejects sender inbox mismatches", async () => {
    const { service } = createService();

    const result = await service.register(sender("different_inbox"), publicSubmit());

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.error.code).toBe("sender-mismatch");
  });

  it("rejects agentId collisions from another inbox", async () => {
    const { service } = createService();
    await service.register(sender(), publicSubmit());

    const result = await service.register(
      sender("inbox_other", "0x1111111111111111111111111111111111111111"),
      publicSubmit({
        agent: {
          agentId: "agent_public",
          syncInboxId: "inbox_other",
          displayName: "Other Agent",
          protocolVersion: "0.1.0",
        },
      }),
    );

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.error.code).toBe("policy");
  });

  it("rejects wallet and agentId collisions from another inbox", async () => {
    const { service } = createService();
    await service.register(sender(), publicSubmit());

    const result = await service.register(
      sender("inbox_other", "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD"),
      publicSubmit({
        agent: {
          agentId: "agent_public",
          syncInboxId: "inbox_other",
          displayName: "Other Agent",
          protocolVersion: "0.1.0",
        },
      }),
    );

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.error.message).toContain("walletAddress and agentId");
  });

  it("returns public records to any caller and private records only to their owner", async () => {
    const { service } = createService();
    await service.register(sender(), publicSubmit());
    await service.register(sender("inbox_private", "0x1111111111111111111111111111111111111111"), {
      requestId: "req_private",
      agent: {
        agentId: "agent_private",
        syncInboxId: "inbox_private",
        displayName: "Private Agent",
        protocolVersion: "0.1.0",
      },
      visibility: "private",
    });

    expect((await service.get("random", { requestId: "get_1", agentId: "agent_public" })).status).toBe("found");
    expect((await service.get("random", { requestId: "get_2", agentId: "agent_private" })).status).toBe("not-found");
    expect((await service.get("inbox_private", { requestId: "get_3", agentId: "agent_private" })).status).toBe("found");
  });

  it("searches public disclosed skills by capability", async () => {
    const { service } = createService();
    await service.register(sender(), publicSubmit());

    const response = await service.query({
      requestId: "query_1",
      capabilityIds: ["sayso.network.search"],
    });

    expect(response.results).toHaveLength(1);
    expect(response.results[0].skillPacket?.skills.map((skill) => skill.skillId)).toContain("sayso.network");
    expect(response.results[0].claimTypes).toContain("sayso.claim.world-id.wallet");
    expect(response.results[0].walletAddress).toBe("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");
  });

  it("keeps protocol query records unchanged while web reads expose skill statuses", async () => {
    const { repository, service } = createService();
    const reference = protocolSkillDocument();
    const modified = { ...reference, content: `${reference.content}\nModified.` };
    const custom = { ...reference, skillId: "sayso.custom", name: "Custom Skill" };
    const packet = createNetworkSkillPacket({
      agentId: "agent_public",
      syncInboxId: "inbox_public",
      displayName: "Public Agent",
    });
    packet.skills = [reference, modified, custom];

    await service.register(sender(), publicSubmit({
      profile: {
        description: "A public SaySo agent",
        skillDisclosure: "include-skill-packet",
        skillPacket: packet,
      },
    }));

    const protocolResponse = await service.query({ requestId: "query_1" });
    const webRecord = await repository.getPublicAgentByIdForWeb("agent_public");

    expect(protocolResponse.results[0]).not.toHaveProperty("skillStatuses");
    expect(webRecord?.skillStatuses?.map((status) => status.status)).toEqual(["reference", "modified", "custom"]);
  });

  it("rejects registration when the sender wallet address cannot be verified", async () => {
    const { service } = createService();

    const result = await service.register({ senderInboxId: "inbox_public" }, publicSubmit());

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.error.message).toContain("Unable to verify");
  });

  it("returns payment requirements for valid premium registrations", async () => {
    const { service } = createPremiumService();

    const result = await service.preparePremiumRegistration(sender(), premiumSubmit());

    expect(result).toMatchObject({
      requestId: "premium_premium-agent",
      x402Version: 1,
      accepts: [
        expect.objectContaining({ network: "eip155:8453", amount: "100000", payTo: premiumRegistration.paymentOptions[0]?.payTo }),
        expect.objectContaining({ network: "xrpl:mainnet", amount: "100000", payTo: premiumRegistration.paymentOptions[1]?.payTo }),
      ],
    });
    if ("resource" in result) expect(result.resource.url).toBe("xmtp://sayso.payment/sayso-network-registry/requests/premium_premium-agent");
  });

  it("settles payment with any advertised premium payment option", async () => {
    const { service } = createPremiumService();
    const required = await service.preparePremiumRegistration(sender(), premiumSubmit());
    const submit = paymentSubmitFor(required);
    if (!("accepts" in required)) throw new Error("Expected payment-required response.");
    submit.payment.accepted = required.accepts[1]!;

    const result = await service.handlePaymentSubmit(sender(), submit);

    expect(result.paymentResult).toMatchObject({ status: "settled", network: "xrpl:mainnet" });
    expect(result.registrationResult).toMatchObject({ status: "accepted" });
  });

  it("settles payment and activates premium registration", async () => {
    const { service } = createPremiumService();
    const required = await service.preparePremiumRegistration(sender(), premiumSubmit());

    const result = await service.handlePaymentSubmit(sender(), paymentSubmitFor(required));
    const record = await service.get("random", { requestId: "get_1", agentId: "premium-agent" });

    expect(result.paymentResult.status).toBe("settled");
    expect(result.registrationResult).toMatchObject({ status: "accepted", visibility: "public" });
    expect(record.status).toBe("found");
    if (record.status === "found") {
      expect(record.result.listingTier).toBe("premium");
      expect(record.result.premiumExpiresAt).toBeTruthy();
    }
  });

  it("rejects mismatched premium payment requirements", async () => {
    const { service, verifier } = createPremiumService();
    const required = await service.preparePremiumRegistration(sender(), premiumSubmit());
    const submit = paymentSubmitFor(required);
    submit.payment.accepted = { ...submit.payment.accepted, amount: "1" };

    const result = await service.handlePaymentSubmit(sender(), submit);

    expect(result.paymentResult).toMatchObject({ status: "error", error: { code: "payment-invalid" } });
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it("rejects premium name collisions before payment", async () => {
    const { service } = createPremiumService();
    await service.register(sender("inbox_other", "0x1111111111111111111111111111111111111111"), publicSubmit({
      agent: {
        agentId: "premium-agent",
        syncInboxId: "inbox_other",
        displayName: "Other Agent",
        protocolVersion: "0.1.0",
      },
    }));

    const result = await service.preparePremiumRegistration(sender(), premiumSubmit());

    expect(result).toMatchObject({ status: "rejected", error: { code: "policy" } });
  });

  it("allows the owning inbox to renew a premium registration", async () => {
    const { service } = createPremiumService();
    const firstRequired = await service.preparePremiumRegistration(sender(), premiumSubmit());
    await service.handlePaymentSubmit(sender(), paymentSubmitFor(firstRequired));
    const secondRequired = await service.preparePremiumRegistration(sender(), premiumSubmit());

    const result = await service.handlePaymentSubmit(sender(), paymentSubmitFor(secondRequired));

    expect(result.registrationResult).toMatchObject({ status: "accepted" });
  });

  it("sorts active premium records before standard records", async () => {
    const { service } = createPremiumService();
    await service.register(sender("inbox_standard", "0x1111111111111111111111111111111111111111"), publicSubmit({
      agent: {
        agentId: "standard-agent",
        syncInboxId: "inbox_standard",
        displayName: "Standard Agent",
        protocolVersion: "0.1.0",
      },
    }));
    const required = await service.preparePremiumRegistration(sender(), premiumSubmit());
    await service.handlePaymentSubmit(sender(), paymentSubmitFor(required));

    const response = await service.query({ requestId: "query_1" });

    expect(response.results.map((record) => record.agent.agentId)).toEqual(["premium-agent", "standard-agent"]);
  });
});
