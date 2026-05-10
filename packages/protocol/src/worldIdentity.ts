import { SAYSO_WORLD_ID_ACTION } from "./constants.js";
import { isRecord } from "./validation.js";
import type { ClaimPresentation, VerifiedClaim } from "./types.js";

export const WORLD_ID_WALLET_CLAIM_TYPE = "sayso.claim.world-id.wallet";

export type WorldIdentityVerification =
  | { status: "verified"; providerResponse: Record<string, unknown> }
  | { status: "malformed"; errorMessage: string }
  | { status: "failed"; errorMessage: string; providerResponse?: Record<string, unknown> };

export type WorldIdentityVerifierConfig = {
  rpId: string;
  action?: string;
  verifyBaseUrl?: string;
};

export const worldIdVerifyUrl = (config: WorldIdentityVerifierConfig) =>
  `${config.verifyBaseUrl ?? "https://developer.world.org/api/v4/verify"}/${encodeURIComponent(config.rpId)}`;

export const validateWorldIdWalletPresentation = (
  presentation: ClaimPresentation,
  config: WorldIdentityVerifierConfig,
): string | null => {
  if (presentation.type !== WORLD_ID_WALLET_CLAIM_TYPE) return "Unsupported presentation type.";
  const payload = presentation.payload;
  const action = config.action ?? SAYSO_WORLD_ID_ACTION;
  if (!isRecord(payload.wallet)) return "World ID wallet must be an object.";
  if (typeof payload.wallet.type !== "string" || payload.wallet.type.length === 0) return "World ID wallet type must be a string.";
  if (typeof payload.wallet.address !== "string" || payload.wallet.address.length === 0) return "World ID wallet address must be a string.";
  if (payload.version !== "world-id-4") return "World ID version must be world-id-4.";
  if (payload.proofType !== "uniqueness") return "World ID proofType must be uniqueness.";
  if (payload.rpId !== config.rpId) return `World ID rpId must be ${config.rpId}.`;
  if (payload.action !== action) return `World ID action must be ${action}.`;
  if (!isRecord(payload.idkitResponse)) return "World ID idkitResponse must be an object.";
  return null;
};

export const verifyWorldIdentity = async (
  presentation: ClaimPresentation,
  config: WorldIdentityVerifierConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<WorldIdentityVerification> => {
  const malformedReason = validateWorldIdWalletPresentation(presentation, config);
  if (malformedReason) return { status: "malformed", errorMessage: malformedReason };
  const response = await fetchImpl(worldIdVerifyUrl(config), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(presentation.payload.idkitResponse),
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const success = response.ok && (json.success === true || json.verified === true || json.status === "success");
  if (!success) {
    return {
      status: "failed",
      errorMessage: typeof json.detail === "string" ? json.detail : "World ID verification failed.",
      providerResponse: json,
    };
  }
  return { status: "verified", providerResponse: json };
};

export const verifiedWorldIdWalletClaim = (
  presentation: ClaimPresentation,
  providerResponse?: Record<string, unknown>,
): VerifiedClaim => ({
  type: WORLD_ID_WALLET_CLAIM_TYPE,
  subject: presentation.payload.wallet as Record<string, unknown>,
  status: "verified",
  verifiedAt: new Date().toISOString(),
  issuer: "world.org",
  ...(providerResponse ? { payload: { providerResponse } } : {}),
});
