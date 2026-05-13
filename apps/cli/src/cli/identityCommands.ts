import { Command } from "commander";
import {
  createIdentity,
  deriveAgentAddresses,
  importIdentity,
  nextAgent,
  unlockIdentity,
  type StoredAgent,
  type StoredIdentity,
} from "@sayso-labs/identity";
import { readIdentityStore, writeIdentityStore } from "./identityStore.js";

const summarizeIdentity = (identity: StoredIdentity): Record<string, unknown> => ({
  id: identity.id,
  label: identity.label,
  identityHandle: identity.identityHandle,
  nextAgentIndex: identity.nextAgentIndex,
  createdAt: identity.createdAt,
  encrypted: identity.mnemonic.kind === "encrypted",
});

const summarizeAgent = (identity: StoredIdentity, agent: StoredAgent): Record<string, unknown> => {
  if (identity.mnemonic.kind !== "plaintext") {
    return { id: agent.id, identityId: agent.identityId, index: agent.index, label: agent.label, addresses: "(encrypted)" };
  }
  const addresses = deriveAgentAddresses(identity.mnemonic.mnemonic, agent.index);
  return {
    id: agent.id,
    identityId: agent.identityId,
    index: agent.index,
    label: agent.label,
    addresses: {
      ethereum: addresses.ethereum.address,
      bitcoin: addresses.bitcoin.address,
      ripple: addresses.ripple.address,
      stellar: addresses.stellar.address,
    },
  };
};

export const registerIdentityCommands = (root: Command): void => {
  const identity = root.command("identity").description("Manage SaySo identities (BIP-39 mnemonic vaults).");

  identity
    .command("create")
    .description("Create a new identity. Prints the mnemonic — save it.")
    .option("-l, --label <label>", "Label for the identity")
    .option("-w, --words <count>", "Mnemonic word count (12 or 24)", "12")
    .action(async (options: { label?: string; words: string }) => {
      const strength = options.words === "24" ? 24 : 12;
      const { stored, mnemonic } = await createIdentity({ label: options.label, strength });
      const unlocked = await unlockIdentity(stored);
      const { agent, identity: updated } = nextAgent(unlocked, { label: "Agent 0" });
      const persisted: StoredIdentity = {
        id: updated.id,
        label: updated.label,
        createdAt: updated.createdAt,
        identityHandle: updated.identityHandle,
        nextAgentIndex: updated.nextAgentIndex,
        mnemonic: updated.mnemonic,
      };
      const store = readIdentityStore();
      store.identities.unshift(persisted);
      store.agents.push(agent);
      writeIdentityStore(store);
      console.log("Mnemonic (write this down; it is the only backup):");
      console.log(mnemonic);
      console.log("");
      console.log("Identity:");
      console.dir(summarizeIdentity(persisted), { depth: null });
      console.log("Default agent:");
      console.dir(summarizeAgent(persisted, agent), { depth: null });
    });

  identity
    .command("import")
    .description("Import an existing BIP-39 mnemonic as an identity.")
    .requiredOption("-m, --mnemonic <mnemonic>", "BIP-39 mnemonic (12 or 24 words)")
    .option("-l, --label <label>", "Label for the identity")
    .action(async (options: { mnemonic: string; label?: string }) => {
      const stored = await importIdentity({ mnemonic: options.mnemonic, label: options.label });
      const unlocked = await unlockIdentity(stored);
      const { agent, identity: updated } = nextAgent(unlocked, { label: "Agent 0" });
      const persisted: StoredIdentity = {
        id: updated.id,
        label: updated.label,
        createdAt: updated.createdAt,
        identityHandle: updated.identityHandle,
        nextAgentIndex: updated.nextAgentIndex,
        mnemonic: updated.mnemonic,
      };
      const store = readIdentityStore();
      store.identities.unshift(persisted);
      store.agents.push(agent);
      writeIdentityStore(store);
      console.dir({
        identity: summarizeIdentity(persisted),
        defaultAgent: summarizeAgent(persisted, agent),
      }, { depth: null });
    });

  identity
    .command("list")
    .description("List stored identities.")
    .action(() => {
      const store = readIdentityStore();
      if (store.identities.length === 0) {
        console.log("No identities stored. Run `sayso identity create`.");
        return;
      }
      console.dir(store.identities.map(summarizeIdentity), { depth: null });
    });

  identity
    .command("export")
    .description("Export an identity's mnemonic. Requires plaintext storage.")
    .argument("<identityId>", "Identity id")
    .action((identityId: string) => {
      const store = readIdentityStore();
      const found = store.identities.find((entry) => entry.id === identityId);
      if (!found) {
        console.error(`No identity with id ${identityId}`);
        process.exitCode = 1;
        return;
      }
      if (found.mnemonic.kind !== "plaintext") {
        console.error("This identity is encrypted; CLI export of encrypted identities is not yet supported.");
        process.exitCode = 1;
        return;
      }
      console.log(found.mnemonic.mnemonic);
    });

  const agent = root.command("agent").description("Manage agents (HD-derived) under a SaySo identity.");

  agent
    .command("derive")
    .description("Derive a new agent under the given identity.")
    .requiredOption("-i, --identity <id>", "Identity id")
    .option("-l, --label <label>", "Label for the new agent")
    .action(async (options: { identity: string; label?: string }) => {
      const store = readIdentityStore();
      const idx = store.identities.findIndex((entry) => entry.id === options.identity);
      if (idx < 0) {
        console.error(`No identity with id ${options.identity}`);
        process.exitCode = 1;
        return;
      }
      const current = store.identities[idx]!;
      const unlocked = await unlockIdentity(current);
      const { agent: newAgent, identity: updated } = nextAgent(unlocked, { label: options.label });
      store.identities[idx] = {
        id: updated.id,
        label: updated.label,
        createdAt: updated.createdAt,
        identityHandle: updated.identityHandle,
        nextAgentIndex: updated.nextAgentIndex,
        mnemonic: updated.mnemonic,
      };
      store.agents.push(newAgent);
      writeIdentityStore(store);
      console.dir(summarizeAgent(store.identities[idx]!, newAgent), { depth: null });
    });

  agent
    .command("list")
    .description("List agents, optionally filtered by identity.")
    .option("-i, --identity <id>", "Identity id")
    .action((options: { identity?: string }) => {
      const store = readIdentityStore();
      const filtered = options.identity
        ? store.agents.filter((entry) => entry.identityId === options.identity)
        : store.agents;
      if (filtered.length === 0) {
        console.log("No agents stored.");
        return;
      }
      const out = filtered.map((agentEntry) => {
        const owner = store.identities.find((entry) => entry.id === agentEntry.identityId);
        if (!owner) return { ...agentEntry, addresses: "(identity missing)" };
        return summarizeAgent(owner, agentEntry);
      });
      console.dir(out, { depth: null });
    });
};
