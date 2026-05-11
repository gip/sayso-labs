import type { RegistryRepository } from "@sayso-labs/db-postgres";
import {
  CONTENT_TYPES,
  createConnectionError,
  createDisconnectAck,
  createError,
  createNetworkResolvedSkill,
  createNetworkSkillPacket,
  createSkillResponse,
  networkSkillDocuments,
  parsePayload,
  premiumRegistrationWriteFromSubmit,
  registrationWriteFromSubmit,
  sanitizeRecordForOwner,
  sanitizeRecordForPublic,
  verifyWorldIdentity,
  verifiedWorldIdWalletClaim,
  WORLD_ID_WALLET_CLAIM_TYPE,
  type AgentGetPayload,
  type AgentGetResponsePayload,
  type AgentQueryPayload,
  type AgentQueryResponsePayload,
  type ClaimPresentation,
  type ConnectionResponsePayload,
  type ErrorPayload,
  type JsonPayload,
  type PaymentRequiredPayload,
  type PaymentResultPayload,
  type PaymentSubmitPayload,
  type PremiumRegistrationSubmitPayload,
  type RegistrationRemovePayload,
  type RegistrationResultPayload,
  type RegistrationSubmitPayload,
  type SkillRequestPayload,
  type SkillResponsePayload,
  type VerifiedClaim,
  type WorldIdentityVerifierConfig,
} from "@sayso-labs/protocol";
import {
  AGENT_CONNECTION_CLAIM_TYPE,
  verifyAgentConnectionPresentation,
} from "./agentConnection.js";
import {
  canonicalJson,
  paymentRequirementsFor,
  paymentResourceFor,
  type PaymentVerifier,
  type PremiumRegistrationPaymentConfig,
} from "./payment.js";

const candidateRequestId = (value: unknown): string =>
  value !== null && typeof value === "object" && "requestId" in value && typeof (value as { requestId: unknown }).requestId === "string"
    ? (value as { requestId: string }).requestId
    : "unknown";

export type RegistryAgentConfig = {
  agentId: string;
  displayName: string;
  syncInboxId: string;
  worldIdVerifyEnabled: boolean;
  worldIdVerifier?: WorldIdentityVerifierConfig;
  premiumRegistration?: PremiumRegistrationPaymentConfig;
};

export type VerifiedSenderIdentity = {
  senderInboxId: string;
  walletAddress?: string;
};

export type RegistryReply = {
  content: JsonPayload;
  contentType: (typeof CONTENT_TYPES)[keyof typeof CONTENT_TYPES];
};

type PendingPremiumRegistration = {
  sender: VerifiedSenderIdentity;
  payload: PremiumRegistrationSubmitPayload;
  paymentRequired: PaymentRequiredPayload;
  expiresAt: Date;
};

export class RegistryService {
  private readonly pendingPremiumRegistrations = new Map<string, PendingPremiumRegistration>();

  constructor(
    private readonly repository: RegistryRepository,
    private readonly config: RegistryAgentConfig,
    private readonly paymentVerifier?: PaymentVerifier,
  ) {}

  private premiumRegistrationEnabled() {
    return this.config.premiumRegistration?.enabled === true;
  }

  skillPacket() {
    return createNetworkSkillPacket({
      agentId: this.config.agentId,
      syncInboxId: this.config.syncInboxId,
      displayName: this.config.displayName,
      includeClaims: true,
      includeWorldId: this.config.worldIdVerifyEnabled,
      includePremiumRegistration: this.premiumRegistrationEnabled(),
    });
  }

  async handleConnectionRequest(sender: VerifiedSenderIdentity, presentations?: ClaimPresentation[]): Promise<ConnectionResponsePayload> {
    const verifiedClaims: VerifiedClaim[] = [];
    for (const presentation of presentations ?? []) {
      if (presentation.type === AGENT_CONNECTION_CLAIM_TYPE) {
        const result = await verifyAgentConnectionPresentation(presentation);
        if (result.status !== "unsupported") {
          await this.repository.saveConnectionClaim({
            senderInboxId: sender.senderInboxId,
            ...(sender.walletAddress ? { walletAddress: sender.walletAddress } : {}),
            claimType: presentation.type,
            status: result.status,
            requesterType: result.requesterType,
            requesterAddress: result.requesterAddress,
            agentType: result.agentType,
            agentAddress: result.agentAddress,
            signatureScheme: result.signatureScheme,
            canonicalMessage: result.canonicalMessage,
            presentation: result.presentation,
            ...("errorMessage" in result ? { errorMessage: result.errorMessage } : {}),
          });
        }
        if (result.status === "malformed") return createConnectionError("presentation-malformed", result.errorMessage);
        if (result.status === "unsupported") return createConnectionError("presentation-unsupported", result.errorMessage);
        if (result.status === "failed") return createConnectionError("presentation-verification-failed", result.errorMessage);
        if (result.status !== "verified") return createConnectionError("presentation-verification-failed", "Agent connection verification failed.");
        verifiedClaims.push(result.verifiedClaim);
        continue;
      }
      if (presentation.type === "sayso.claim.wallet-control") {
        return createConnectionError("presentation-unsupported", "This registry does not verify sayso.claim.wallet-control presentations yet.");
      }
      if (presentation.type !== WORLD_ID_WALLET_CLAIM_TYPE) {
        return createConnectionError("presentation-unsupported", "This registry supports sayso.claim.world-id.wallet presentations only.");
      }
      if (!this.config.worldIdVerifyEnabled) {
        return createConnectionError("presentation-unsupported", "World ID verification is disabled for this registry.");
      }
      if (!this.config.worldIdVerifier) {
        return createConnectionError("presentation-verification-failed", "World ID verifier is not configured.");
      }
      try {
        const result = await verifyWorldIdentity(presentation, this.config.worldIdVerifier);
        await this.repository.saveConnectionClaim({
          senderInboxId: sender.senderInboxId,
          ...(sender.walletAddress ? { walletAddress: sender.walletAddress } : {}),
          claimType: presentation.type,
          status: result.status === "verified" ? "verified" : result.status,
          ...("providerResponse" in result && result.providerResponse ? { providerResponse: result.providerResponse } : {}),
          ...("errorMessage" in result ? { errorMessage: result.errorMessage } : {}),
        });
        if (result.status === "malformed") return createConnectionError("presentation-malformed", result.errorMessage);
        if (result.status === "failed") return createConnectionError("presentation-verification-failed", result.errorMessage);
        verifiedClaims.push(verifiedWorldIdWalletClaim(presentation, result.providerResponse));
      } catch (error) {
        await this.repository.saveConnectionClaim({
          senderInboxId: sender.senderInboxId,
          ...(sender.walletAddress ? { walletAddress: sender.walletAddress } : {}),
          claimType: presentation.type,
          status: "provider-error",
          errorMessage: error instanceof Error ? error.message : "World ID verification provider error.",
        });
        return createConnectionError("presentation-verification-failed", "World ID verification provider error.");
      }
    }
    return {
      status: "ok",
      protocolVersion: "0.1.0",
      supportedProtocolVersions: ["0.1.0"],
      agent: {
        agentId: this.config.agentId,
        syncInboxId: this.config.syncInboxId,
        displayName: this.config.displayName,
      },
      next: "sayso.protocol/skill-request/1",
      skillPacket: this.skillPacket(),
      ...(verifiedClaims.length ? { verifiedClaims } : {}),
    };
  }

  handleSkillRequest(request?: SkillRequestPayload): SkillResponsePayload {
    return createSkillResponse({
      agent: {
        agentId: this.config.agentId,
        kind: "service",
        syncInboxId: this.config.syncInboxId,
        displayName: this.config.displayName,
      },
      resolvedSkill: createNetworkResolvedSkill(
        this.config.syncInboxId,
        true,
        this.config.worldIdVerifyEnabled,
        this.premiumRegistrationEnabled(),
      ),
      skills: networkSkillDocuments(true, this.config.worldIdVerifyEnabled, this.premiumRegistrationEnabled()),
      request,
      content: "# SaySo Network\n\nCanonical SaySo Network registry service.",
    });
  }

  async handleRegistrationSubmit(sender: VerifiedSenderIdentity, content: unknown): Promise<RegistrationResultPayload> {
    const result = parsePayload<RegistrationSubmitPayload>("registration-submit", content);
    if (!result.ok) return registrationRejected(candidateRequestId(content), "malformed", result.error);
    return this.register(sender, result.value);
  }

  async register(sender: VerifiedSenderIdentity, payload: RegistrationSubmitPayload): Promise<RegistrationResultPayload> {
    if (payload.agent.syncInboxId !== sender.senderInboxId) {
      return registrationRejected(payload.requestId, "sender-mismatch", "XMTP sender inbox does not match registration.agent.syncInboxId.");
    }
    if (!sender.walletAddress) {
      return registrationRejected(payload.requestId, "policy", "Unable to verify a wallet address for the XMTP sender inbox.");
    }
    const walletAgentCollision = await this.repository.findByWalletAddressAndAgentId(sender.walletAddress, payload.agent.agentId);
    if (walletAgentCollision && walletAgentCollision.agent.syncInboxId !== sender.senderInboxId) {
      return registrationRejected(payload.requestId, "policy", "walletAddress and agentId are already registered by another sync inbox.");
    }
    const agentCollision = await this.repository.findByAgentId(payload.agent.agentId);
    if (agentCollision && agentCollision.agent.syncInboxId !== sender.senderInboxId) {
      return registrationRejected(payload.requestId, "policy", "agentId is already registered by another sync inbox.");
    }
    if (payload.visibility === "public" && !payload.profile?.description) {
      return registrationRejected(payload.requestId, "malformed", "Public registrations require profile.description.");
    }
    if (payload.profile?.skillDisclosure === "include-skill-packet" && !payload.profile.skillPacket) {
      return registrationRejected(payload.requestId, "malformed", "include-skill-packet registrations require profile.skillPacket.");
    }
    const record = await this.repository.upsertRegistrationBySyncInbox(registrationWriteFromSubmit(payload, sender.walletAddress));
    return {
      requestId: payload.requestId,
      status: "accepted",
      registrationId: record.registrationId,
      visibility: record.visibility,
      updatedAt: record.updatedAt,
    };
  }

  async handlePremiumRegistrationSubmit(
    sender: VerifiedSenderIdentity,
    content: unknown,
  ): Promise<PaymentRequiredPayload | RegistrationResultPayload> {
    const result = parsePayload<PremiumRegistrationSubmitPayload>("premium-registration-submit", content);
    if (!result.ok) return registrationRejected(candidateRequestId(content), "malformed", result.error);
    return this.preparePremiumRegistration(sender, result.value);
  }

  async preparePremiumRegistration(
    sender: VerifiedSenderIdentity,
    payload: PremiumRegistrationSubmitPayload,
  ): Promise<PaymentRequiredPayload | RegistrationResultPayload> {
    this.prunePendingPremiumRegistrations();
    if (!this.premiumRegistrationEnabled() || !this.config.premiumRegistration) {
      return registrationRejected(payload.requestId, "unsupported", "Premium registration is disabled for this registry.");
    }
    if (payload.agent.syncInboxId !== sender.senderInboxId) {
      return registrationRejected(payload.requestId, "sender-mismatch", "XMTP sender inbox does not match registration.agent.syncInboxId.");
    }
    if (!sender.walletAddress) {
      return registrationRejected(payload.requestId, "policy", "Unable to verify a wallet address for the XMTP sender inbox.");
    }
    const agentCollision = await this.repository.findByAgentId(payload.agent.agentId);
    if (agentCollision && agentCollision.agent.syncInboxId !== sender.senderInboxId && recordIsActive(agentCollision)) {
      return registrationRejected(payload.requestId, "policy", "agentId is already registered by another sync inbox.");
    }
    const pendingCollision = [...this.pendingPremiumRegistrations.values()].find((pending) =>
      pending.payload.agent.agentId === payload.agent.agentId &&
      pending.sender.senderInboxId !== sender.senderInboxId &&
      pending.expiresAt.getTime() > Date.now()
    );
    if (pendingCollision) {
      return registrationRejected(payload.requestId, "policy", "agentId has a pending premium registration payment.");
    }

    const resource = paymentResourceFor(
      this.config.agentId,
      payload.requestId,
      `SaySo Network premium registration for ${payload.agent.agentId}`,
    );
    const paymentRequired: PaymentRequiredPayload = {
      requestId: payload.requestId,
      x402Version: this.config.premiumRegistration.x402Version,
      resource,
      accepts: paymentRequirementsFor(this.config.premiumRegistration),
      reason: "Premium SaySo Network registration requires settled payment before activation.",
      extensions: {
        "sayso.network": {
          capabilityId: "sayso.network.premium-register",
          agentId: payload.agent.agentId,
          termSeconds: this.config.premiumRegistration.termSeconds,
        },
      },
    };
    this.pendingPremiumRegistrations.set(this.pendingKey(sender.senderInboxId, payload.requestId), {
      sender,
      payload,
      paymentRequired,
      expiresAt: new Date(Date.now() + this.config.premiumRegistration.maxTimeoutSeconds * 1000),
    });
    return paymentRequired;
  }

  async handlePaymentSubmit(
    sender: VerifiedSenderIdentity,
    content: unknown,
  ): Promise<{ paymentResult: PaymentResultPayload; registrationResult?: RegistrationResultPayload }> {
    const result = parsePayload<PaymentSubmitPayload>("payment-submit", content);
    if (!result.ok) {
      return { paymentResult: paymentError(candidateRequestId(content), "payment-invalid", result.error) };
    }
    return this.settlePremiumRegistration(sender, result.value);
  }

  async settlePremiumRegistration(
    sender: VerifiedSenderIdentity,
    payload: PaymentSubmitPayload,
  ): Promise<{ paymentResult: PaymentResultPayload; registrationResult?: RegistrationResultPayload }> {
    this.prunePendingPremiumRegistrations();
    const pending = this.pendingPremiumRegistrations.get(this.pendingKey(sender.senderInboxId, payload.requestId));
    if (!pending) {
      return { paymentResult: paymentError(payload.requestId, "payment-required", "No pending premium registration payment requirement matched this request.") };
    }
    if (pending.expiresAt.getTime() <= Date.now()) {
      this.pendingPremiumRegistrations.delete(this.pendingKey(sender.senderInboxId, payload.requestId));
      return { paymentResult: paymentError(payload.requestId, "request-expired", "Pending premium registration payment requirement expired.") };
    }
    const expected = pending.paymentRequired;
    const matchedRequirement = expected.accepts.find((requirement) =>
      canonicalJson(payload.payment.accepted) === canonicalJson(requirement)
    );
    if (
      payload.payment.x402Version !== expected.x402Version ||
      !matchedRequirement ||
      canonicalJson(payload.payment.resource) !== canonicalJson(expected.resource)
    ) {
      return { paymentResult: paymentError(payload.requestId, "payment-invalid", "Payment payload does not match the active premium registration requirement.") };
    }
    if (!this.paymentVerifier) {
      return { paymentResult: paymentError(payload.requestId, "internal", "Premium payment verifier is not configured.") };
    }
    const paymentResult = await this.paymentVerifier.verify({ sender, request: expected, submit: payload });
    if (paymentResult.status !== "settled") {
      return { paymentResult };
    }
    if (paymentResult.network !== matchedRequirement.network) {
      return { paymentResult: paymentError(payload.requestId, "payment-failed", "Payment verifier settled a different network than the accepted requirement.") };
    }
    const collision = await this.repository.findByAgentId(pending.payload.agent.agentId);
    if (collision && collision.agent.syncInboxId !== sender.senderInboxId && recordIsActive(collision)) {
      this.pendingPremiumRegistrations.delete(this.pendingKey(sender.senderInboxId, payload.requestId));
      return {
        paymentResult,
        registrationResult: registrationRejected(payload.requestId, "policy", "agentId is already registered by another sync inbox."),
      };
    }
    const premiumExpiresAt = new Date(Date.now() + (this.config.premiumRegistration?.termSeconds ?? 0) * 1000);
    const record = await this.repository.upsertPremiumRegistrationBySyncInbox(
      premiumRegistrationWriteFromSubmit(pending.payload, pending.sender.walletAddress ?? "", premiumExpiresAt),
    );
    this.pendingPremiumRegistrations.delete(this.pendingKey(sender.senderInboxId, payload.requestId));
    return {
      paymentResult,
      registrationResult: {
        requestId: pending.payload.requestId,
        status: "accepted",
        registrationId: record.registrationId,
        visibility: record.visibility,
        updatedAt: record.updatedAt,
      },
    };
  }

  async handleRegistrationRemove(senderInboxId: string, content: unknown): Promise<RegistrationResultPayload> {
    const result = parsePayload<RegistrationRemovePayload>("registration-remove", content);
    if (!result.ok) return registrationRejected(candidateRequestId(content), "malformed", result.error);
    return this.remove(senderInboxId, result.value);
  }

  async remove(senderInboxId: string, payload: RegistrationRemovePayload): Promise<RegistrationResultPayload> {
    const removed = await this.repository.removeOwnedRegistration({
      senderInboxId,
      agentId: payload.agentId,
      syncInboxId: payload.syncInboxId,
    });
    if (!removed) return registrationRejected(payload.requestId, "policy", "No owned registration matched the remove request.");
    return {
      requestId: payload.requestId,
      status: "accepted",
      registrationId: payload.agentId ?? payload.syncInboxId ?? senderInboxId,
      visibility: "private",
      updatedAt: new Date().toISOString(),
    };
  }

  async handleAgentQuery(content: unknown): Promise<AgentQueryResponsePayload | ErrorPayload> {
    const result = parsePayload<AgentQueryPayload>("agent-query", content);
    if (!result.ok) return createError("malformed", result.error, candidateRequestId(content));
    return this.query(result.value);
  }

  async query(payload: AgentQueryPayload): Promise<AgentQueryResponsePayload> {
    const page = await this.repository.listPublicAgents(payload);
    return {
      requestId: payload.requestId,
      results: page.results.map(sanitizeRecordForPublic),
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  }

  async handleAgentGet(senderInboxId: string, content: unknown): Promise<AgentGetResponsePayload | ErrorPayload> {
    const result = parsePayload<AgentGetPayload>("agent-get", content);
    if (!result.ok) return createError("malformed", result.error, candidateRequestId(content));
    return this.get(senderInboxId, result.value);
  }

  async get(senderInboxId: string, payload: AgentGetPayload): Promise<AgentGetResponsePayload> {
    const record = payload.agentId
      ? await this.repository.findByAgentId(payload.agentId)
      : payload.syncInboxId
        ? await this.repository.findBySyncInboxId(payload.syncInboxId)
        : null;
    if (!record) return { requestId: payload.requestId, status: "not-found" };
    if (record.visibility === "private" && record.agent.syncInboxId !== senderInboxId) {
      return { requestId: payload.requestId, status: "not-found" };
    }
    return {
      requestId: payload.requestId,
      status: "found",
      result: record.visibility === "public" ? sanitizeRecordForPublic(record) : sanitizeRecordForOwner(record),
    };
  }

  disconnect() {
    return createDisconnectAck("disconnect", { closed: ["connection_state"] });
  }

  forgetMe() {
    return createDisconnectAck("forget-me", { deleted: ["connection_state", "onboarding_state"] });
  }

  private pendingKey(senderInboxId: string, requestId: string) {
    return `${senderInboxId}:${requestId}`;
  }

  private prunePendingPremiumRegistrations() {
    const now = Date.now();
    for (const [key, pending] of this.pendingPremiumRegistrations) {
      if (pending.expiresAt.getTime() <= now) this.pendingPremiumRegistrations.delete(key);
    }
  }
}

const recordIsActive = (record: { expiresAt?: string }) =>
  record.expiresAt === undefined || new Date(record.expiresAt).getTime() > Date.now();

const registrationRejected = (
  requestId: string,
  code: RegistrationResultPayload extends infer T
    ? T extends { status: "rejected"; error: { code: infer C } }
      ? C
      : never
    : never,
  message: string,
): RegistrationResultPayload => ({
  requestId,
  status: "rejected",
  error: { code, message },
});

const paymentError = (
  requestId: string,
  code: PaymentResultPayload extends infer T
    ? T extends { status: "error"; error: { code: infer C } }
      ? C
      : never
    : never,
  message: string,
): PaymentResultPayload => ({
  requestId,
  status: "error",
  error: { code, message },
});
