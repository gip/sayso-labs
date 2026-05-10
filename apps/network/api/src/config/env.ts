import { existsSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";
import type { PremiumRegistrationPaymentConfig, PremiumRegistrationPaymentOption } from "../registry/payment.js";

export type RegistryEnvironment = "dev" | "production";
export const registryEnvironments = ["dev", "production"] as const satisfies readonly RegistryEnvironment[];

const booleanFromEnv = z
  .string()
  .optional()
  .transform((value) => value === undefined || value === "" ? undefined : value === "true" || value === "1");

const optionalStringFromEnv = z
  .string()
  .optional()
  .transform((value) => value === "" ? undefined : value);

const envSchema = z.object({
  DATABASE_URL: optionalStringFromEnv,
  DEV_DATABASE_URL: optionalStringFromEnv,
  PRODUCTION_DATABASE_URL: optionalStringFromEnv,
  XMTP_PRIVATE_KEY: optionalStringFromEnv,
  XMTP_DB_ENCRYPTION_KEY: optionalStringFromEnv,
  DEV_XMTP_PRIVATE_KEY: optionalStringFromEnv,
  DEV_XMTP_DB_ENCRYPTION_KEY: optionalStringFromEnv,
  PRODUCTION_XMTP_PRIVATE_KEY: optionalStringFromEnv,
  PRODUCTION_XMTP_DB_ENCRYPTION_KEY: optionalStringFromEnv,
  HTTP_HOST: z.string().default("0.0.0.0"),
  HTTP_PORT: z.coerce.number().int().positive().default(8787),
  WORLD_ID_VERIFY_ENABLED: booleanFromEnv.default(true),
  WORLD_ID_RP_ID: z.string().optional(),
  WORLD_ID_ACTION: z.string().default("human"),
  WORLD_ID_VERIFY_BASE_URL: z.string().url().default("https://developer.world.org/api/v4/verify"),
  START_XMTP: booleanFromEnv.default(true),
  PREMIUM_REGISTRATION_ENABLED: booleanFromEnv.default(false),
  PREMIUM_REGISTRATION_PAYMENT_OPTIONS: optionalStringFromEnv,
  PREMIUM_REGISTRATION_AMOUNT: z.string().default("100000"),
  PREMIUM_REGISTRATION_ASSET: z.string().default("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
  PREMIUM_REGISTRATION_NETWORK: z.string().default("eip155:8453"),
  PREMIUM_REGISTRATION_SCHEME: z.string().default("exact"),
  PREMIUM_REGISTRATION_PAY_TO: optionalStringFromEnv,
  PREMIUM_REGISTRATION_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(300),
  PREMIUM_REGISTRATION_TERM_SECONDS: z.coerce.number().int().positive().default(2592000),
  PREMIUM_REGISTRATION_VERIFY_URL: optionalStringFromEnv,
}).superRefine((value, context) => {
  if (!value.DEV_DATABASE_URL && !value.DATABASE_URL) {
    context.addIssue({
      code: "custom",
      path: ["DEV_DATABASE_URL"],
      message: "DEV_DATABASE_URL is required. DATABASE_URL is accepted as a backwards-compatible alias.",
    });
  }
  if (value.WORLD_ID_VERIFY_ENABLED !== false && !value.WORLD_ID_RP_ID) {
    context.addIssue({
      code: "custom",
      path: ["WORLD_ID_RP_ID"],
      message: "WORLD_ID_RP_ID is required when WORLD_ID_VERIFY_ENABLED=true.",
    });
  }
  if (value.PREMIUM_REGISTRATION_ENABLED) {
    if (!value.PREMIUM_REGISTRATION_PAYMENT_OPTIONS && !value.PREMIUM_REGISTRATION_PAY_TO) {
      context.addIssue({
        code: "custom",
        path: ["PREMIUM_REGISTRATION_PAY_TO"],
        message: "PREMIUM_REGISTRATION_PAY_TO is required when PREMIUM_REGISTRATION_ENABLED=true.",
      });
    }
    if (!value.PREMIUM_REGISTRATION_VERIFY_URL) {
      context.addIssue({
        code: "custom",
        path: ["PREMIUM_REGISTRATION_VERIFY_URL"],
        message: "PREMIUM_REGISTRATION_VERIFY_URL is required when PREMIUM_REGISTRATION_ENABLED=true.",
      });
    }
  }
});

export type XmtpCredentials = {
  privateKey?: string;
  dbEncryptionKey?: string;
};

export type BackendConfig = {
  databaseUrls: Partial<Record<RegistryEnvironment, string>>;
  enabledEnvironments: RegistryEnvironment[];
  defaultEnvironment: RegistryEnvironment;
  xmtpCredentials: Record<RegistryEnvironment, XmtpCredentials>;
  httpHost: string;
  httpPort: number;
  worldIdVerifyEnabled: boolean;
  worldIdRpId?: string;
  worldIdAction: string;
  worldIdVerifyBaseUrl: string;
  startXmtp: boolean;
  premiumRegistration: (PremiumRegistrationPaymentConfig & { verifyUrl: string }) | null;
};

const findWorkspaceRoot = () => {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../.."),
    path.resolve(process.cwd(), "../../.."),
  ];
  return candidates.find((candidate) => existsSync(path.join(candidate, "pnpm-workspace.yaml"))) ?? process.cwd();
};

export const loadEnvFiles = () => {
  if (process.env.SAYSO_SKIP_ENV_FILES === "true" || process.env.SAYSO_SKIP_ENV_FILES === "1") return;
  const workspaceRoot = findWorkspaceRoot();
  const appRoot = path.resolve(workspaceRoot, "apps/network/api");
  for (const filePath of [
    path.join(workspaceRoot, ".env"),
    path.join(workspaceRoot, ".env.local"),
    path.join(appRoot, ".env"),
    path.join(appRoot, ".env.local"),
  ]) {
    if (existsSync(filePath)) loadDotenv({ path: filePath, override: filePath.endsWith(".local") });
  }
};

const buildDatabaseUrls = (parsed: z.infer<typeof envSchema>): Partial<Record<RegistryEnvironment, string>> => ({
  dev: parsed.DEV_DATABASE_URL ?? parsed.DATABASE_URL,
  ...(parsed.PRODUCTION_DATABASE_URL ? { production: parsed.PRODUCTION_DATABASE_URL } : {}),
});

const buildXmtpCredentials = (parsed: z.infer<typeof envSchema>): Record<RegistryEnvironment, XmtpCredentials> => ({
  dev: {
    privateKey: parsed.DEV_XMTP_PRIVATE_KEY ?? parsed.XMTP_PRIVATE_KEY,
    dbEncryptionKey: parsed.DEV_XMTP_DB_ENCRYPTION_KEY ?? parsed.XMTP_DB_ENCRYPTION_KEY,
  },
  production: {
    privateKey: parsed.PRODUCTION_XMTP_PRIVATE_KEY ?? parsed.XMTP_PRIVATE_KEY,
    dbEncryptionKey: parsed.PRODUCTION_XMTP_DB_ENCRYPTION_KEY ?? parsed.XMTP_DB_ENCRYPTION_KEY,
  },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parsePaymentOptions = (parsed: z.infer<typeof envSchema>): PremiumRegistrationPaymentOption[] => {
  if (!parsed.PREMIUM_REGISTRATION_PAYMENT_OPTIONS) {
    if (!parsed.PREMIUM_REGISTRATION_PAY_TO) return [];
    return [
      {
        scheme: parsed.PREMIUM_REGISTRATION_SCHEME,
        network: parsed.PREMIUM_REGISTRATION_NETWORK,
        asset: parsed.PREMIUM_REGISTRATION_ASSET,
        amount: parsed.PREMIUM_REGISTRATION_AMOUNT,
        payTo: parsed.PREMIUM_REGISTRATION_PAY_TO,
        extra: {
          name: "USDC",
          decimals: 6,
        },
      },
    ];
  }

  let value: unknown;
  try {
    value = JSON.parse(parsed.PREMIUM_REGISTRATION_PAYMENT_OPTIONS);
  } catch (error) {
    throw new Error(`PREMIUM_REGISTRATION_PAYMENT_OPTIONS must be valid JSON: ${(error as Error).message}`);
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("PREMIUM_REGISTRATION_PAYMENT_OPTIONS must be a non-empty JSON array.");
  }

  return value.map((option, index) => {
    if (!isRecord(option)) {
      throw new Error(`PREMIUM_REGISTRATION_PAYMENT_OPTIONS[${index}] must be an object.`);
    }
    const missing = ["scheme", "network", "asset", "amount", "payTo"].filter((key) => typeof option[key] !== "string" || option[key] === "");
    if (missing.length > 0) {
      throw new Error(`PREMIUM_REGISTRATION_PAYMENT_OPTIONS[${index}] is missing required string fields: ${missing.join(", ")}.`);
    }
    const maxTimeoutSeconds = option.maxTimeoutSeconds;
    if (maxTimeoutSeconds !== undefined && (typeof maxTimeoutSeconds !== "number" || !Number.isInteger(maxTimeoutSeconds) || maxTimeoutSeconds <= 0)) {
      throw new Error(`PREMIUM_REGISTRATION_PAYMENT_OPTIONS[${index}].maxTimeoutSeconds must be a positive integer.`);
    }
    return {
      scheme: option.scheme as string,
      network: option.network as string,
      asset: option.asset as string,
      amount: option.amount as string,
      payTo: option.payTo as string,
      extra: isRecord(option.extra) ? option.extra : {},
      ...(typeof maxTimeoutSeconds === "number" ? { maxTimeoutSeconds } : {}),
    };
  });
};

export const loadConfig = (env = process.env): BackendConfig => {
  const parsed = envSchema.parse(env);
  const databaseUrls = buildDatabaseUrls(parsed);
  const paymentOptions = parsed.PREMIUM_REGISTRATION_ENABLED ? parsePaymentOptions(parsed) : [];
  return {
    databaseUrls,
    enabledEnvironments: registryEnvironments.filter((environment) => Boolean(databaseUrls[environment])),
    defaultEnvironment: "dev",
    xmtpCredentials: buildXmtpCredentials(parsed),
    httpHost: parsed.HTTP_HOST,
    httpPort: parsed.HTTP_PORT,
    worldIdVerifyEnabled: parsed.WORLD_ID_VERIFY_ENABLED ?? true,
    worldIdRpId: parsed.WORLD_ID_RP_ID,
    worldIdAction: parsed.WORLD_ID_ACTION,
    worldIdVerifyBaseUrl: parsed.WORLD_ID_VERIFY_BASE_URL,
    startXmtp: parsed.START_XMTP ?? true,
    premiumRegistration: parsed.PREMIUM_REGISTRATION_ENABLED && paymentOptions.length > 0 && parsed.PREMIUM_REGISTRATION_VERIFY_URL
      ? {
          enabled: true,
          x402Version: 1,
          maxTimeoutSeconds: parsed.PREMIUM_REGISTRATION_TIMEOUT_SECONDS,
          termSeconds: parsed.PREMIUM_REGISTRATION_TERM_SECONDS,
          paymentOptions,
          verifyUrl: parsed.PREMIUM_REGISTRATION_VERIFY_URL,
        }
      : null,
  };
};
