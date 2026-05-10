import { Pool, type PoolClient } from "pg";

const quoteIdent = (identifier: string) => `"${identifier.replaceAll("\"", "\"\"")}"`;

const parseConnectionString = (connectionString: string) => {
  try {
    const url = new URL(connectionString);
    const schema = url.searchParams.get("sayso_schema");
    if (!schema) return { connectionString };
    url.searchParams.delete("sayso_schema");
    return { connectionString: url.toString(), schema };
  } catch {
    return { connectionString };
  }
};

export const createPgPool = (connectionString = process.env.DATABASE_URL) => {
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  const parsed = parseConnectionString(connectionString);
  return new Pool({
    connectionString: parsed.connectionString,
    ...(parsed.schema
      ? {
          onConnect: async (client: PoolClient) => {
            await client.query(`SET search_path TO ${quoteIdent(parsed.schema)}`);
          },
        }
      : {}),
  } as ConstructorParameters<typeof Pool>[0] & {
    onConnect?: (client: PoolClient) => Promise<void>;
  });
};
