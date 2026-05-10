import { describe, expect, it } from "vitest";
import { loadConfig } from "./env.js";

const baseEnv = {
  WORLD_ID_VERIFY_ENABLED: "false",
  START_XMTP: "false",
};

describe("loadConfig", () => {
  it("uses DATABASE_URL as the dev database fallback", () => {
    const config = loadConfig({
      ...baseEnv,
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/sayso_dev",
      PRODUCTION_DATABASE_URL: "",
    });

    expect(config.databaseUrls).toMatchObject({
      dev: "postgresql://postgres:postgres@localhost:5432/sayso_dev",
    });
    expect(config.enabledEnvironments).toEqual(["dev"]);
    expect(config.defaultEnvironment).toBe("dev");
  });

  it("enables production when PRODUCTION_DATABASE_URL is configured", () => {
    const config = loadConfig({
      ...baseEnv,
      DEV_DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/sayso_dev",
      PRODUCTION_DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/sayso_prod",
    });

    expect(config.databaseUrls).toMatchObject({
      dev: "postgresql://postgres:postgres@localhost:5432/sayso_dev",
      production: "postgresql://postgres:postgres@localhost:5432/sayso_prod",
    });
    expect(config.enabledEnvironments).toEqual(["dev", "production"]);
  });

  it("falls back to shared XMTP credentials unless environment overrides are set", () => {
    const config = loadConfig({
      ...baseEnv,
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/sayso_dev",
      PRODUCTION_DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/sayso_prod",
      XMTP_PRIVATE_KEY: "shared-private",
      XMTP_DB_ENCRYPTION_KEY: "shared-db",
      PRODUCTION_XMTP_PRIVATE_KEY: "production-private",
      PRODUCTION_XMTP_DB_ENCRYPTION_KEY: "production-db",
    });

    expect(config.xmtpCredentials.dev).toEqual({
      privateKey: "shared-private",
      dbEncryptionKey: "shared-db",
    });
    expect(config.xmtpCredentials.production).toEqual({
      privateKey: "production-private",
      dbEncryptionKey: "production-db",
    });
  });

  it("loads multiple premium payment options", () => {
    const config = loadConfig({
      ...baseEnv,
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/sayso_dev",
      PREMIUM_REGISTRATION_ENABLED: "true",
      PREMIUM_REGISTRATION_VERIFY_URL: "https://payments.example.test/verify",
      PREMIUM_REGISTRATION_PAYMENT_OPTIONS: JSON.stringify([
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
          network: "stellar:pubnet",
          asset: "RLUSD:GISSUER",
          amount: "1000000",
          payTo: "GREGISTRYPAYEE",
          extra: { name: "RLUSD", decimals: 7, chain: "Stellar" },
        },
      ]),
    });

    expect(config.premiumRegistration?.paymentOptions).toHaveLength(2);
    expect(config.premiumRegistration?.paymentOptions[0]).toMatchObject({ network: "eip155:8453", extra: { name: "USDC" } });
    expect(config.premiumRegistration?.paymentOptions[1]).toMatchObject({ network: "stellar:pubnet", extra: { name: "RLUSD" } });
  });
});
