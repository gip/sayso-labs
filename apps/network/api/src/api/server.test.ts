import { describe, expect, it } from "vitest";
import { createNetworkSkillPacket } from "@sayso-labs/protocol";
import { createHttpServer } from "./server.js";
import { FakeRegistryRepository } from "../test/fakeRepository.js";

const seedRepository = async (repository: FakeRegistryRepository, idPrefix: string) => {
  await repository.upsertRegistrationBySyncInbox({
    agentId: `${idPrefix}_public`,
    syncInboxId: `${idPrefix}_inbox_public`,
    walletAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    displayName: `${idPrefix} Public Agent`,
    protocolVersion: "0.1.0",
    visibility: "public",
    description: "A public SaySo agent",
    skillDisclosure: "include-skill-packet",
    skillPacket: createNetworkSkillPacket({
      agentId: `${idPrefix}_public`,
      syncInboxId: `${idPrefix}_inbox_public`,
      displayName: `${idPrefix} Public Agent`,
    }),
    skillIds: ["sayso.network"],
    capabilityIds: ["sayso.network.search"],
    claimTypes: ["sayso.claim.world-id.wallet"],
  });
  await repository.upsertRegistrationBySyncInbox({
    agentId: `${idPrefix}_private`,
    syncInboxId: `${idPrefix}_inbox_private`,
    walletAddress: "0x1111111111111111111111111111111111111111",
    displayName: `${idPrefix} Private Agent`,
    protocolVersion: "0.1.0",
    visibility: "private",
    description: "Private registration",
    skillDisclosure: "summary-only",
    skillIds: [],
    capabilityIds: [],
    claimTypes: [],
  });
};

describe("HTTP API", () => {
  it("defaults to dev and returns stats and public agents", async () => {
    const repository = new FakeRegistryRepository();
    await seedRepository(repository, "dev");
    const app = createHttpServer({ dev: repository });

    const stats = await app.inject({ method: "GET", url: "/api/stats" });
    const agents = await app.inject({ method: "GET", url: "/api/agents" });
    const privateDetail = await app.inject({ method: "GET", url: "/api/agents/dev_private" });

    expect(stats.json()).toMatchObject({ total: 2, public: 1, private: 1 });
    expect(agents.json().results).toHaveLength(1);
    expect(agents.json().results[0]).toMatchObject({ connectionCount: 0 });
    expect(agents.json().results[0].skillStatuses).toEqual(
      expect.arrayContaining([expect.objectContaining({ skillId: "sayso.protocol", status: "reference" })]),
    );
    expect(privateDetail.statusCode).toBe(404);
    await app.close();
  });

  it("routes reads by environment", async () => {
    const dev = new FakeRegistryRepository();
    const production = new FakeRegistryRepository();
    await seedRepository(dev, "dev");
    await seedRepository(production, "prod");
    const app = createHttpServer({ dev, production });

    const environments = await app.inject({ method: "GET", url: "/api/environments" });
    const devAgents = await app.inject({ method: "GET", url: "/api/agents?env=dev" });
    const productionAgents = await app.inject({ method: "GET", url: "/api/agents?env=production" });
    const productionDetail = await app.inject({ method: "GET", url: "/api/agents/prod_public?env=production" });

    expect(environments.json()).toEqual({ defaultEnvironment: "dev", environments: ["dev", "production"] });
    expect(devAgents.json().results[0].agent.agentId).toBe("dev_public");
    expect(productionAgents.json().results[0].agent.agentId).toBe("prod_public");
    expect(productionDetail.json().agent.agentId).toBe("prod_public");
    await app.close();
  });

  it("rejects invalid and unavailable environments", async () => {
    const dev = new FakeRegistryRepository();
    await seedRepository(dev, "dev");
    const app = createHttpServer({ dev });

    const invalid = await app.inject({ method: "GET", url: "/api/stats?env=local" });
    const unavailable = await app.inject({ method: "GET", url: "/api/stats?env=production" });

    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ error: "invalid-environment", environments: ["dev"] });
    expect(unavailable.statusCode).toBe(400);
    expect(unavailable.json()).toMatchObject({ error: "unavailable-environment", environment: "production", environments: ["dev"] });
    await app.close();
  });
});
