#!/usr/bin/env node
import Fastify from "fastify";
import { SaySoSqliteLocalStore } from "@sayso-labs/db-sqlite";
import { DEFAULT_LOCAL_BACKEND_HOST, DEFAULT_LOCAL_BACKEND_PORT, ensureLocalPaths } from "@sayso-labs/local-core";

const app = Fastify({ logger: true });
const paths = ensureLocalPaths();
const store = new SaySoSqliteLocalStore(paths);

app.get("/api/health", async () => ({
  service: "sayso-personal-service",
  ...store.health(),
}));

app.get("/api/local/paths", async () => paths);

app.post("/api/shutdown", async (_request, reply) => {
  void app.close();
  return reply.send({ status: "ok" });
});

const host = process.env.SAYSO_LOCAL_HTTP_HOST ?? DEFAULT_LOCAL_BACKEND_HOST;
const port = Number.parseInt(process.env.SAYSO_LOCAL_HTTP_PORT ?? String(DEFAULT_LOCAL_BACKEND_PORT), 10);

await app.listen({ host, port });
