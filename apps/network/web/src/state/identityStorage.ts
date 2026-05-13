import {
  createIdentity,
  deriveAgentAddresses,
  derivePrivateKeys,
  nextAgent as nextAgentForIdentity,
  type AgentAddresses,
  type StoredAgent,
  type StoredIdentity,
} from "@sayso-labs/identity";

export const identityStorageKey = "sayso:identity:v2";
export const agentStorageKey = "sayso:identity:agents:v2";
export const activeIdentityStorageKey = "sayso:identity:active:v2";
export const activeAgentStorageKey = "sayso:identity:active-agent:v2";

const safeWindow = (): Storage | null => {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
};

const readJson = <T>(key: string, fallback: T): T => {
  const store = safeWindow();
  if (!store) return fallback;
  try {
    const raw = store.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown): void => {
  const store = safeWindow();
  if (!store) return;
  try { store.setItem(key, JSON.stringify(value)); } catch { /* constrained context */ }
};

const writeString = (key: string, value: string | null): void => {
  const store = safeWindow();
  if (!store) return;
  try {
    if (value === null) store.removeItem(key);
    else store.setItem(key, value);
  } catch { /* constrained context */ }
};

const readString = (key: string): string | null => {
  const store = safeWindow();
  if (!store) return null;
  try { return store.getItem(key); } catch { return null; }
};

export const readStoredIdentities = (): StoredIdentity[] =>
  readJson<StoredIdentity[]>(identityStorageKey, []).filter(
    (entry) => entry?.id && entry.mnemonic && entry.identityHandle,
  );

export const readStoredAgents = (): StoredAgent[] =>
  readJson<StoredAgent[]>(agentStorageKey, []).filter((entry) => entry?.id && entry.identityId);

export const readActiveIdentityId = (): string | null => readString(activeIdentityStorageKey);
export const readActiveAgentId = (): string | null => readString(activeAgentStorageKey);

export const writeStoredIdentities = (identities: StoredIdentity[]): void => writeJson(identityStorageKey, identities);
export const writeStoredAgents = (agents: StoredAgent[]): void => writeJson(agentStorageKey, agents);
export const writeActiveIdentityId = (id: string | null): void => writeString(activeIdentityStorageKey, id);
export const writeActiveAgentId = (id: string | null): void => writeString(activeAgentStorageKey, id);

export const mnemonicPlaintextOf = (identity: StoredIdentity): string => {
  if (identity.mnemonic.kind !== "plaintext") {
    throw new Error("This identity is encrypted; unlock it before deriving keys.");
  }
  return identity.mnemonic.mnemonic;
};

export const addressesForAgent = (identity: StoredIdentity, agent: StoredAgent): AgentAddresses =>
  deriveAgentAddresses(mnemonicPlaintextOf(identity), agent.index);

export const ethPrivateKeyForAgent = (identity: StoredIdentity, agent: StoredAgent): `0x${string}` => {
  const keys = derivePrivateKeys(mnemonicPlaintextOf(identity), agent.index);
  return `0x${Array.from(keys.ethereum, (b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
};

export type CreateIdentityResult = {
  identity: StoredIdentity;
  defaultAgent: StoredAgent;
};

export const provisionIdentity = async (label?: string): Promise<CreateIdentityResult> => {
  const { stored } = await createIdentity({ label });
  const { agent: defaultAgent, identity } = nextAgentForIdentity(
    { ...stored, mnemonicPlaintext: mnemonicPlaintextOf(stored) },
    { label: "Agent 0" },
  );
  const persisted: StoredIdentity = {
    id: identity.id,
    label: identity.label,
    createdAt: identity.createdAt,
    identityHandle: identity.identityHandle,
    nextAgentIndex: identity.nextAgentIndex,
    mnemonic: identity.mnemonic,
  };
  return { identity: persisted, defaultAgent };
};

export const provisionAgent = (identity: StoredIdentity, label?: string): {
  identity: StoredIdentity;
  agent: StoredAgent;
} => {
  const { agent, identity: updated } = nextAgentForIdentity(
    { ...identity, mnemonicPlaintext: mnemonicPlaintextOf(identity) },
    { label },
  );
  return {
    identity: {
      id: updated.id,
      label: updated.label,
      createdAt: updated.createdAt,
      identityHandle: updated.identityHandle,
      nextAgentIndex: updated.nextAgentIndex,
      mnemonic: updated.mnemonic,
    },
    agent,
  };
};
