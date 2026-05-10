import { describe, expect, it } from "vitest";
import { createPgPool } from "./client.js";

describe("createPgPool", () => {
  it("requires a connection string", () => {
    expect(() => createPgPool(undefined)).toThrow("DATABASE_URL is required.");
  });

  it("creates a pg pool without connecting eagerly", async () => {
    const pool = createPgPool("postgresql://postgres:postgres@localhost:5432/sayso_network");
    expect(pool.options.connectionString).toContain("sayso_network");
    await pool.end();
  });

  it("removes the sayso_schema helper parameter from the pg connection string", async () => {
    const pool = createPgPool("postgresql://postgres:postgres@localhost:5432/sayso_network?sslmode=require&sayso_schema=sayso_func_test");
    expect(pool.options.connectionString).toContain("sslmode=require");
    expect(pool.options.connectionString).not.toContain("sayso_schema");
    await pool.end();
  });
});
