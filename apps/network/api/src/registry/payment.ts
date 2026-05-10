import type {
  PaymentRequiredPayload,
  PaymentResultPayload,
  PaymentSubmitPayload,
  X402PaymentRequirements,
  X402ResourceInfo,
} from "@sayso-labs/protocol";

export type PremiumRegistrationPaymentOption = {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  extra: Record<string, unknown>;
  maxTimeoutSeconds?: number;
};

export type PremiumRegistrationPaymentConfig = {
  enabled: boolean;
  x402Version: number;
  paymentOptions: PremiumRegistrationPaymentOption[];
  maxTimeoutSeconds: number;
  termSeconds: number;
};

export type PaymentVerificationInput = {
  sender: {
    senderInboxId: string;
    walletAddress?: string;
  };
  request: PaymentRequiredPayload;
  submit: PaymentSubmitPayload;
};

export type PaymentVerifier = {
  verify(input: PaymentVerificationInput): Promise<PaymentResultPayload>;
};

export const paymentResourceFor = (agentId: string, requestId: string, description: string): X402ResourceInfo => ({
  url: `xmtp://sayso.payment/${agentId}/requests/${requestId}`,
  description,
  mimeType: "application/json",
});

export const paymentRequirementsFor = (config: PremiumRegistrationPaymentConfig): X402PaymentRequirements[] =>
  config.paymentOptions.map((option) => ({
    scheme: option.scheme,
    network: option.network,
    asset: option.asset,
    amount: option.amount,
    payTo: option.payTo,
    maxTimeoutSeconds: option.maxTimeoutSeconds ?? config.maxTimeoutSeconds,
    extra: option.extra,
  }));

export const canonicalJson = (value: unknown): string => {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
};

export class HttpPaymentVerifier implements PaymentVerifier {
  constructor(private readonly verifyUrl: string) {}

  async verify(input: PaymentVerificationInput): Promise<PaymentResultPayload> {
    const response = await fetch(this.verifyUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      return {
        status: "error",
        requestId: input.submit.requestId,
        error: {
          code: "payment-failed",
          message: `Payment verifier returned HTTP ${response.status}.`,
        },
      };
    }
    return await response.json() as PaymentResultPayload;
  }
}
