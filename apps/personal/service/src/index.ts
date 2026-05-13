#!/usr/bin/env node
import Fastify from "fastify";
import { SaySoSqliteLocalStore } from "@sayso-labs/db-sqlite";
import { DEFAULT_LOCAL_BACKEND_HOST, DEFAULT_LOCAL_BACKEND_PORT, ensureLocalPaths } from "@sayso-labs/local-core";
import {
  createIdentityHandler,
  deriveAgentHandler,
  listAgents,
  listIdentities,
  resolveIdentityFile,
} from "./identities.js";

const app = Fastify({ logger: true });
const paths = ensureLocalPaths();
const store = new SaySoSqliteLocalStore(paths);
const identityFile = resolveIdentityFile(paths.home);

app.get("/api/health", async () => ({
  service: "sayso-personal-service",
  ...store.health(),
}));

app.get("/api/local/paths", async () => paths);

app.get("/api/identities", async () => listIdentities(identityFile));

app.post<{ Body?: { label?: string; words?: number } }>("/api/identities", async (request) =>
  createIdentityHandler(identityFile, request.body));

app.get<{ Params: { id: string } }>("/api/identities/:id/agents", async (request) =>
  listAgents(identityFile, request.params.id));

app.post<{ Params: { id: string }; Body?: { label?: string } }>(
  "/api/identities/:id/agents",
  async (request, reply) => {
    const result = await deriveAgentHandler(identityFile, request.params.id, request.body);
    if (!result) return reply.code(404).send({ error: "identity not found" });
    return result;
  },
);

app.post("/api/shutdown", async (_request, reply) => {
  void app.close();
  return reply.send({ status: "ok" });
});

const host = process.env.SAYSO_LOCAL_HTTP_HOST ?? DEFAULT_LOCAL_BACKEND_HOST;
const port = Number.parseInt(process.env.SAYSO_LOCAL_HTTP_PORT ?? String(DEFAULT_LOCAL_BACKEND_PORT), 10);

await app.listen({ host, port });
