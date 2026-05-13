import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  createIdentity,
  deriveAgentAddresses,
  nextAgent,
  unlockIdentity,
  type StoredAgent,
  type StoredIdentity,
} from "@sayso-labs/identity";

export type IdentityFile = {
  identities: StoredIdentity[];
  agents: StoredAgent[];
};

const emptyFile = (): IdentityFile => ({ identities: [], agents: [] });

export const resolveIdentityFile = (home: string): string => path.join(home, "identities.json");

export const readIdentityFile = (file: string): IdentityFile => {
  if (!existsSync(file)) return emptyFile();
  try {
    const data = JSON.parse(readFileSync(file, "utf8")) as IdentityFile;
    return {
      identities: Array.isArray(data.identities) ? data.identities : [],
      agents: Array.isArray(data.agents) ? data.agents : [],
    };
  } catch {
    return emptyFile();
  }
};

export const writeIdentityFile = (data: IdentityFile, file: string): void => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
};

const stripUnlocked = (input: StoredIdentity): StoredIdentity => ({
  id: input.id,
  label: input.label,
  createdAt: input.createdAt,
  identityHandle: input.identityHandle,
  nextAgentIndex: input.nextAgentIndex,
  mnemonic: input.mnemonic,
});

const publicIdentity = (identity: StoredIdentity) => ({
  id: identity.id,
  label: identity.label,
  identityHandle: identity.identityHandle,
  nextAgentIndex: identity.nextAgentIndex,
  createdAt: identity.createdAt,
  encrypted: identity.mnemonic.kind === "encrypted",
});

const publicAgent = (identity: StoredIdentity, agent: StoredAgent) => {
  if (identity.mnemonic.kind !== "plaintext") {
    return {
      id: agent.id,
      identityId: agent.identityId,
      index: agent.index,
      label: agent.label,
      createdAt: agent.createdAt,
      addresses: null,
    };
  }
  const addresses = deriveAgentAddresses(identity.mnemonic.mnemonic, agent.index);
  return {
    id: agent.id,
    identityId: agent.identityId,
    index: agent.index,
    label: agent.label,
    createdAt: agent.createdAt,
    addresses: {
      ethereum: { address: addresses.ethereum.address, derivationPath: addresses.ethereum.derivationPath },
      bitcoin: { address: addresses.bitcoin.address, derivationPath: addresses.bitcoin.derivationPath },
      ripple: { address: addresses.ripple.address, derivationPath: addresses.ripple.derivationPath },
      stellar: { address: addresses.stellar.address, derivationPath: addresses.stellar.derivationPath },
    },
  };
};

export const listIdentities = (file: string) => {
  const store = readIdentityFile(file);
  return { identities: store.identities.map(publicIdentity) };
};

export const listAgents = (file: string, identityId?: string) => {
  const store = readIdentityFile(file);
  const owners = new Map(store.identities.map((entry) => [entry.id, entry] as const));
  const filtered = identityId ? store.agents.filter((entry) => entry.identityId === identityId) : store.agents;
  const out = filtered.map((agent) => {
    const owner = owners.get(agent.identityId);
    if (!owner) {
      return { id: agent.id, identityId: agent.identityId, index: agent.index, label: agent.label, createdAt: agent.createdAt, addresses: null };
    }
    return publicAgent(owner, agent);
  });
  return { agents: out };
};

export const createIdentityHandler = async (file: string, body: { label?: string; words?: number } | undefined) => {
  const strength = body?.words === 24 ? 24 : 12;
  const { stored, mnemonic } = await createIdentity({ label: body?.label, strength });
  const unlocked = await unlockIdentity(stored);
  const { agent, identity: updated } = nextAgent(unlocked, { label: "Agent 0" });
  const persisted = stripUnlocked(updated);
  const store = readIdentityFile(file);
  store.identities.unshift(persisted);
  store.agents.push(agent);
  writeIdentityFile(store, file);
  return {
    mnemonic,
    identity: publicIdentity(persisted),
    defaultAgent: publicAgent(persisted, agent),
  };
};

export const deriveAgentHandler = async (
  file: string,
  identityId: string,
  body: { label?: string } | undefined,
) => {
  const store = readIdentityFile(file);
  const idx = store.identities.findIndex((entry) => entry.id === identityId);
  if (idx < 0) return null;
  const unlocked = await unlockIdentity(store.identities[idx]!);
  const { agent, identity: updated } = nextAgent(unlocked, { label: body?.label });
  store.identities[idx] = stripUnlocked(updated);
  store.agents.push(agent);
  writeIdentityFile(store, file);
  return publicAgent(store.identities[idx]!, agent);
};
