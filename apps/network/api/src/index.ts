import { createPgPool, PgRegistryRepository } from "@sayso-labs/db-postgres";
import { createHttpServer } from "./api/server.js";
import { loadConfig, loadEnvFiles, type RegistryEnvironment } from "./config/env.js";
import { HttpPaymentVerifier } from "./registry/payment.js";
import { RegistryService } from "./registry/service.js";
import { createXmtpClient } from "./xmtp/client.js";
import { runRegistryXmtpAgent } from "./xmtp/agent.js";

loadEnvFiles();
const config = loadConfig();
const repositories = Object.fromEntries(
  config.enabledEnvironments.map((environment) => {
    const databaseUrl = config.databaseUrls[environment];
    if (!databaseUrl) throw new Error(`Missing database URL for ${environment}.`);
    return [environment, new PgRegistryRepository(createPgPool(databaseUrl))];
  }),
) as Partial<Record<RegistryEnvironment, PgRegistryRepository>>;
const app = createHttpServer(repositories, { defaultEnvironment: config.defaultEnvironment });

await app.listen({ host: config.httpHost, port: config.httpPort });

const startRegistryAgent = async (environment: RegistryEnvironment, repository: PgRegistryRepository) => {
  const credentials = config.xmtpCredentials[environment];
  if (!credentials.privateKey || !credentials.dbEncryptionKey) {
    throw new Error(
      `${environment.toUpperCase()} XMTP credentials are required when START_XMTP=true. ` +
        "Set XMTP_PRIVATE_KEY and XMTP_DB_ENCRYPTION_KEY, or environment-specific overrides.",
    );
  }
  const { client, walletAddress } = await createXmtpClient({
    privateKey: credentials.privateKey,
    dbEncryptionKey: credentials.dbEncryptionKey,
    env: environment,
  });
  const service = new RegistryService(repository, {
    agentId: "sayso-network-registry",
    displayName: "SaySo Network Registry",
    syncInboxId: client.inboxId,
    worldIdVerifyEnabled: config.worldIdVerifyEnabled,
    ...(config.premiumRegistration
      ? {
          premiumRegistration: config.premiumRegistration,
        }
      : {}),
    ...(config.worldIdRpId
      ? {
          worldIdVerifier: {
            rpId: config.worldIdRpId,
            action: config.worldIdAction,
            verifyBaseUrl: config.worldIdVerifyBaseUrl,
          },
        }
      : {}),
  }, config.premiumRegistration ? new HttpPaymentVerifier(config.premiumRegistration.verifyUrl) : undefined);
  console.log("SaySo Network registry agent running");
  console.log(`Wallet: ${walletAddress}`);
  console.log(`Inbox ID: ${client.inboxId}`);
  console.log(`Environment: ${environment}`);
  await runRegistryXmtpAgent(client, service);
};

if (config.startXmtp) {
  await Promise.all(
    config.enabledEnvironments.map((environment) => {
      const repository = repositories[environment];
      if (!repository) throw new Error(`Missing repository for ${environment}.`);
      return startRegistryAgent(environment, repository);
    }),
  );
}
