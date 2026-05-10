import { SAYSO_NETWORK_VERSION, SAYSO_PAYMENT_VERSION, SAYSO_PROTOCOL_VERSION } from "./constants.js";
import { readSkillMarkdown } from "./markdown.js";
import { createSkillPacket } from "./protocol.js";
import type { AgentSkillContract, SkillPacket, SaySoSkillDocument } from "./types.js";

export const protocolSkillDocument = (): SaySoSkillDocument => ({
  skillId: "sayso.protocol",
  name: "SaySo Protocol",
  version: SAYSO_PROTOCOL_VERSION,
  kind: "meta",
  imports: [],
  skill: {
    capabilities: [
      {
        capabilityId: "sayso.connection",
        title: "SaySo connection",
        description: "Read agent info, connect, and refresh current skills.",
        requestContentTypes: ["sayso.protocol/connection-request/1"],
        responseContentTypes: ["sayso.protocol/agent-info/1", "sayso.protocol/connection-response/1"],
        channels: ["sync"],
        paymentPolicy: "none",
      },
      {
        capabilityId: "sayso.discovery",
        title: "Skill discovery",
        description: "Return the structured and human-readable skill contract for this agent.",
        requestContentTypes: ["sayso.protocol/skill-request/1"],
        responseContentTypes: ["sayso.protocol/skill-response/1"],
        channels: ["sync"],
        paymentPolicy: "none",
      },
      {
        capabilityId: "sayso.disconnect",
        title: "Disconnect",
        description: "Disconnect from the agent or request data deletion.",
        requestContentTypes: ["sayso.protocol/disconnect/1", "sayso.protocol/forget-me/1"],
        responseContentTypes: ["sayso.protocol/disconnect-ack/1"],
        channels: ["sync"],
        paymentPolicy: "none",
      },
    ],
    contentTypes: [
      { authorityId: "sayso.protocol", typeId: "agent-info", versionMajor: 1, versionMinor: 0, purpose: "Send agent identity, fallback text, and full current skill packet on connection.", channel: "sync" },
      { authorityId: "sayso.protocol", typeId: "connection-request", versionMajor: 1, versionMinor: 0, purpose: "Request SaySo connection with an empty JSON payload or optional claim presentations.", channel: "sync" },
      { authorityId: "sayso.protocol", typeId: "connection-response", versionMajor: 1, versionMinor: 0, purpose: "Return SaySo protocol version, verified claims, and next step.", channel: "sync" },
      { authorityId: "sayso.protocol", typeId: "skill-request", versionMajor: 1, versionMinor: 0, purpose: "Request the agent skill contract.", channel: "sync" },
      { authorityId: "sayso.protocol", typeId: "skill-response", versionMajor: 1, versionMinor: 0, purpose: "Return the agent skill contract.", channel: "sync" },
      { authorityId: "sayso.protocol", typeId: "disconnect", versionMajor: 1, versionMinor: 0, purpose: "Close the current conversation context.", channel: "sync" },
      { authorityId: "sayso.protocol", typeId: "forget-me", versionMajor: 1, versionMinor: 0, purpose: "Close the relationship and request data deletion.", channel: "sync" },
      { authorityId: "sayso.protocol", typeId: "disconnect-ack", versionMajor: 1, versionMinor: 0, purpose: "Report disconnect or deletion handling.", channel: "sync" },
      { authorityId: "sayso.protocol", typeId: "error", versionMajor: 1, versionMinor: 0, purpose: "Report a core protocol error.", channel: "sync" },
    ],
    channels: [],
    paymentPolicies: [],
  },
  content: readSkillMarkdown("skills/sayso-protocol/SKILL.md"),
  mediaType: "text/markdown",
});

export const networkSkillDocument = (includePremiumRegistration = true): SaySoSkillDocument => ({
  skillId: "sayso.network",
  name: "SaySo Network",
  version: SAYSO_NETWORK_VERSION,
  kind: "service",
  imports: [
    { skillId: "sayso.protocol", version: "^0.1.0", required: true },
    ...(includePremiumRegistration ? [{ skillId: "sayso.payment", version: "^0.1.0", required: true }] : []),
  ],
  skill: {
    capabilities: [
      {
        capabilityId: "sayso.network.register",
        title: "Register agent",
        description: "Register, update, or remove an agent from the SaySo Network registry.",
        requestContentTypes: ["sayso.network/registration-submit/1", "sayso.network/registration-remove/1"],
        responseContentTypes: ["sayso.network/registration-result/1"],
        channels: ["sync"],
        paymentPolicy: "none",
      },
      ...(includePremiumRegistration
        ? [
            {
              capabilityId: "sayso.network.premium-register",
              title: "Premium registration",
              description: "Reserve a paid canonical agent name and featured public registry listing.",
              requestContentTypes: ["sayso.network/premium-registration-submit/1", "sayso.payment/payment-submit/1"],
              responseContentTypes: ["sayso.payment/payment-required/1", "sayso.payment/payment-result/1", "sayso.network/registration-result/1"],
              channels: ["sync"],
              paymentPolicy: "required",
            },
          ]
        : []),
      {
        capabilityId: "sayso.network.search",
        title: "Search agents",
        description: "Search public agent registrations.",
        requestContentTypes: ["sayso.network/agent-query/1", "sayso.network/agent-get/1"],
        responseContentTypes: ["sayso.network/agent-query-response/1", "sayso.network/agent-get-response/1"],
        channels: ["sync"],
        paymentPolicy: "none",
      },
    ],
    contentTypes: [
      { authorityId: "sayso.network", typeId: "registration-submit", versionMajor: 1, versionMinor: 0, purpose: "Register or update the sender's agent record.", channel: "sync" },
      ...(includePremiumRegistration
        ? [
            { authorityId: "sayso.network", typeId: "premium-registration-submit", versionMajor: 1, versionMinor: 0, purpose: "Request a paid canonical-name registration.", channel: "sync" },
          ]
        : []),
      { authorityId: "sayso.network", typeId: "registration-result", versionMajor: 1, versionMinor: 0, purpose: "Report registration acceptance or rejection.", channel: "sync" },
      { authorityId: "sayso.network", typeId: "registration-remove", versionMajor: 1, versionMinor: 0, purpose: "Remove the sender's agent record.", channel: "sync" },
      { authorityId: "sayso.network", typeId: "agent-query", versionMajor: 1, versionMinor: 0, purpose: "Search public registered agents.", channel: "sync" },
      { authorityId: "sayso.network", typeId: "agent-query-response", versionMajor: 1, versionMinor: 0, purpose: "Return public matching agent records.", channel: "sync" },
      { authorityId: "sayso.network", typeId: "agent-get", versionMajor: 1, versionMinor: 0, purpose: "Fetch one registered agent by id or sync inbox.", channel: "sync" },
      { authorityId: "sayso.network", typeId: "agent-get-response", versionMajor: 1, versionMinor: 0, purpose: "Return one agent record or not-found.", channel: "sync" },
    ],
    channels: [],
    paymentPolicies: includePremiumRegistration
      ? [
          {
            policyId: "sayso-network-premium-registration",
            capabilityIds: ["sayso.network.premium-register"],
            required: true,
            terms: {
              pricing: "x402 exact payment for fixed-term premium registration across configured rails",
            },
          },
        ]
      : [],
  },
  content: readSkillMarkdown("skills/sayso-network/SKILL.md"),
  mediaType: "text/markdown",
});

export const paymentSkillDocument = (): SaySoSkillDocument => ({
  skillId: "sayso.payment",
  name: "SaySo Payment",
  version: SAYSO_PAYMENT_VERSION,
  kind: "payment",
  imports: [{ skillId: "sayso.protocol", version: "^0.1.0", required: true }],
  skill: {
    capabilities: [
      {
        capabilityId: "sayso.payment.negotiate",
        title: "Payment negotiation",
        description: "Negotiate x402-shaped payment requirements and settlement over XMTP.",
        requestContentTypes: ["sayso.payment/payment-submit/1"],
        responseContentTypes: ["sayso.payment/payment-required/1", "sayso.payment/payment-result/1"],
        channels: ["sync"],
        paymentPolicy: "none",
      },
    ],
    contentTypes: [
      { authorityId: "sayso.payment", typeId: "payment-required", versionMajor: 1, versionMinor: 0, purpose: "Describe payment requirements for a request.", channel: "sync" },
      { authorityId: "sayso.payment", typeId: "payment-submit", versionMajor: 1, versionMinor: 0, purpose: "Submit an x402 payment payload.", channel: "sync" },
      { authorityId: "sayso.payment", typeId: "payment-result", versionMajor: 1, versionMinor: 0, purpose: "Report payment verification, settlement, or failure.", channel: "sync" },
    ],
    channels: [],
    paymentPolicies: [],
  },
  content: readSkillMarkdown("skills/sayso-payment/SKILL.md"),
  mediaType: "text/markdown",
});

export const claimSkillDocument = (includeWorldId = true): SaySoSkillDocument => {
  const capabilities = [
    ...(includeWorldId
      ? [
          {
            capabilityId: "sayso.claim.world-id.wallet",
            title: "World ID wallet claim",
            description: "Verify a World ID 4 uniqueness proof for a wallet in connection-request/1.",
            requestContentTypes: ["sayso.protocol/connection-request/1"],
            responseContentTypes: ["sayso.protocol/connection-response/1"],
            channels: ["sync"],
            paymentPolicy: "none",
            claimType: "sayso.claim.world-id.wallet",
          },
        ]
      : []),
    {
      capabilityId: "sayso.claim.agent-connection",
      title: "Agent connection claim",
      description: "Verify a requester wallet signature proving intent to connect to a specific agent.",
      requestContentTypes: ["sayso.protocol/connection-request/1"],
      responseContentTypes: ["sayso.protocol/connection-response/1"],
      channels: ["sync"],
      paymentPolicy: "none",
      claimType: "sayso.claim.agent-connection",
    },
  ];

  return {
    skillId: "sayso.claim",
    name: "SaySo Claim",
    version: "0.1.0",
    kind: "claim",
    imports: [{ skillId: "sayso.protocol", version: "^0.1.0", required: true }],
    skill: {
      capabilities,
      contentTypes: [],
      channels: [],
      paymentPolicies: [],
    },
    content: readSkillMarkdown("skills/sayso-claim/SKILL.md"),
    mediaType: "text/markdown",
  };
};

export const createNetworkResolvedSkill = (
  syncInboxId: string,
  includeClaims: boolean,
  includeWorldId = includeClaims,
  includePremiumRegistration = true,
): AgentSkillContract => {
  const documents = [
    protocolSkillDocument(),
    networkSkillDocument(includePremiumRegistration),
    ...(includePremiumRegistration ? [paymentSkillDocument()] : []),
    ...(includeClaims ? [claimSkillDocument(includeWorldId)] : []),
  ];
  return {
    capabilities: documents.flatMap((document) => document.skill.capabilities),
    contentTypes: documents.flatMap((document) => document.skill.contentTypes),
    channels: [
      {
        channelId: "sync",
        kind: "sync",
        description: "Public XMTP sync inbox for SaySo Network registration and public search.",
        inboxId: syncInboxId,
        contentTypes: [
          "sayso.protocol/agent-info/1",
          "sayso.protocol/connection-request/1",
          "sayso.protocol/connection-response/1",
          "sayso.protocol/skill-request/1",
          "sayso.protocol/skill-response/1",
          "sayso.protocol/disconnect/1",
          "sayso.protocol/forget-me/1",
          "sayso.protocol/disconnect-ack/1",
          "sayso.protocol/error/1",
          "sayso.network/registration-submit/1",
          ...(includePremiumRegistration
            ? [
                "sayso.network/premium-registration-submit/1",
                "sayso.payment/payment-required/1",
                "sayso.payment/payment-submit/1",
                "sayso.payment/payment-result/1",
              ]
            : []),
          "sayso.network/registration-result/1",
          "sayso.network/registration-remove/1",
          "sayso.network/agent-query/1",
          "sayso.network/agent-query-response/1",
          "sayso.network/agent-get/1",
          "sayso.network/agent-get-response/1",
        ],
      },
    ],
    paymentPolicies: documents.flatMap((document) => document.skill.paymentPolicies),
  };
};

export const networkSkillDocuments = (includeClaims = true, includeWorldId = includeClaims, includePremiumRegistration = true) => [
  protocolSkillDocument(),
  networkSkillDocument(includePremiumRegistration),
  ...(includePremiumRegistration ? [paymentSkillDocument()] : []),
  ...(includeClaims ? [claimSkillDocument(includeWorldId)] : []),
];

export const createNetworkSkillPacket = (input: {
  agentId: string;
  syncInboxId: string;
  displayName: string;
  includeClaims?: boolean;
  includeWorldId?: boolean;
  includePremiumRegistration?: boolean;
}): SkillPacket => {
  const includeClaims = input.includeClaims ?? true;
  const includeWorldId = input.includeWorldId ?? includeClaims;
  const includePremiumRegistration = input.includePremiumRegistration ?? true;
  const skills = networkSkillDocuments(includeClaims, includeWorldId, includePremiumRegistration);
  return createSkillPacket({
    agent: {
      agentId: input.agentId,
      syncInboxId: input.syncInboxId,
      displayName: input.displayName,
      kind: "service",
      protocolVersion: SAYSO_PROTOCOL_VERSION,
    },
    skill: createNetworkResolvedSkill(input.syncInboxId, includeClaims, includeWorldId, includePremiumRegistration),
    skills,
    mode: "all",
    content: readSkillMarkdown("skills/sayso-network/SKILL.md"),
  });
};
