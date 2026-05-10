import cors from "@fastify/cors";
import Fastify from "fastify";
import type { RegistryRepository } from "@sayso-labs/db-postgres";
import { registryEnvironments, type RegistryEnvironment } from "../config/env.js";

const parseCsv = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) return value.flatMap((item) => String(item).split(",")).map((item) => item.trim()).filter(Boolean);
  if (typeof value !== "string") return undefined;
  const parsed = value.split(",").map((item) => item.trim()).filter(Boolean);
  return parsed.length ? parsed : undefined;
};

export type RepositoryByEnvironment = Partial<Record<RegistryEnvironment, RegistryRepository>>;

type RepositoryResolution =
  | { ok: true; environment: RegistryEnvironment; repository: RegistryRepository }
  | {
      ok: false;
      error: {
        statusCode: 400;
        payload: {
          error: "invalid-environment" | "unavailable-environment";
          environment?: RegistryEnvironment;
          environments: RegistryEnvironment[];
        };
      };
    };

const isRegistryEnvironment = (value: string): value is RegistryEnvironment =>
  registryEnvironments.includes(value as RegistryEnvironment);

const firstQueryValue = (value: unknown) => Array.isArray(value) ? value[0] : value;

export const createHttpServer = (
  repositories: RepositoryByEnvironment,
  options: { defaultEnvironment?: RegistryEnvironment } = {},
) => {
  const app = Fastify({ logger: true });
  void app.register(cors, { origin: true });
  const defaultEnvironment = options.defaultEnvironment ?? "dev";
  const environments = registryEnvironments.filter((environment) => repositories[environment]);

  const resolveRepository = (query: { env?: unknown }): RepositoryResolution => {
    const rawEnv = firstQueryValue(query.env);
    const environment = rawEnv === undefined ? defaultEnvironment : String(rawEnv);
    if (!isRegistryEnvironment(environment)) {
      return {
        ok: false,
        error: {
          statusCode: 400,
          payload: { error: "invalid-environment", environments },
        },
      };
    }
    const repository = repositories[environment];
    if (!repository) {
      return {
        ok: false,
        error: {
          statusCode: 400,
          payload: { error: "unavailable-environment", environment, environments },
        },
      };
    }
    return { ok: true, environment, repository };
  };

  app.get("/api/environments", async () => ({
    defaultEnvironment,
    environments,
  }));

  app.get("/api/health", async (request, reply) => {
    const resolved = resolveRepository(request.query as { env?: unknown });
    if (!resolved.ok) return reply.code(resolved.error.statusCode).send(resolved.error.payload);
    await resolved.repository.health();
    return { status: "ok", database: "ok", environment: resolved.environment };
  });

  app.get("/api/stats", async (request, reply) => {
    const resolved = resolveRepository(request.query as { env?: unknown });
    if (!resolved.ok) return reply.code(resolved.error.statusCode).send(resolved.error.payload);
    return resolved.repository.stats();
  });

  app.get("/api/agents", async (request, reply) => {
    const query = request.query as {
      env?: unknown;
      query?: string;
      skillIds?: string | string[];
      capabilityIds?: string | string[];
      limit?: string;
      cursor?: string;
    };
    const resolved = resolveRepository(query);
    if (!resolved.ok) return reply.code(resolved.error.statusCode).send(resolved.error.payload);
    return resolved.repository.listPublicAgentsForWeb({
      query: query.query,
      skillIds: parseCsv(query.skillIds),
      capabilityIds: parseCsv(query.capabilityIds),
      limit: query.limit ? Number(query.limit) : undefined,
      cursor: query.cursor,
    });
  });

  app.get("/api/agents/:agentId", async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const resolved = resolveRepository(request.query as { env?: unknown });
    if (!resolved.ok) return reply.code(resolved.error.statusCode).send(resolved.error.payload);
    const record = await resolved.repository.getPublicAgentByIdForWeb(agentId);
    if (!record) return reply.code(404).send({ error: "not-found" });
    return record;
  });

  return app;
};
