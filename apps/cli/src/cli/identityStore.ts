import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { resolveSaySoHome } from "@sayso-labs/local-core";
import type { StoredAgent, StoredIdentity } from "@sayso-labs/identity";

export const resolveIdentityStorePath = (env: NodeJS.ProcessEnv = process.env): string => {
  if (env.SAYSO_IDENTITY_FILE && env.SAYSO_IDENTITY_FILE.length > 0) return env.SAYSO_IDENTITY_FILE;
  return path.join(resolveSaySoHome(env), "identities.json");
};

export type IdentityStoreFile = {
  identities: StoredIdentity[];
  agents: StoredAgent[];
};

export const emptyStore = (): IdentityStoreFile => ({ identities: [], agents: [] });

export const readIdentityStore = (file = resolveIdentityStorePath()): IdentityStoreFile => {
  if (!existsSync(file)) return emptyStore();
  try {
    const data = JSON.parse(readFileSync(file, "utf8")) as IdentityStoreFile;
    return {
      identities: Array.isArray(data.identities) ? data.identities : [],
      agents: Array.isArray(data.agents) ? data.agents : [],
    };
  } catch {
    return emptyStore();
  }
};

export const writeIdentityStore = (data: IdentityStoreFile, file = resolveIdentityStorePath()): void => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
};
