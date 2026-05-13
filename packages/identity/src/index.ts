import { createMnemonic, isValidMnemonic, mnemonicToSeed, type MnemonicStrength } from "./mnemonic.js";
import {
  agentAddressList,
  deriveAgentAddresses,
  deriveIdentityHandle,
  derivePrivateKeys,
  pathFor,
  BTC_PATH,
  ETH_PATH,
  XLM_PATH,
  XRP_PATH,
} from "./derive.js";
import { decryptMnemonic, encryptMnemonic } from "./encrypt.js";
import {
  signMessageWithAgentKeys,
  verifyEthereumEip191,
  verifyBitcoinSaysoV1,
  verifyRippleSaysoV1,
  verifyStellarSaysoV1,
  verifySaysoChainSignature,
  EIP191_SCHEME,
  SAYSO_BITCOIN_SCHEME,
  SAYSO_RIPPLE_SCHEME,
  SAYSO_STELLAR_SCHEME,
} from "./sign.js";
import { buildAgentRoster, buildWalletControlClaim, rosterIdentityHandleFor } from "./presentations.js";
import type {
  AgentAddress,
  AgentAddresses,
  AgentRecord,
  AgentRosterPresentation,
  ChainType,
  EncryptedBlob,
  StoredAgent,
  StoredIdentity,
  UnlockedIdentity,
  WalletControlPresentation,
  WalletControlSignature,
} from "./types.js";

export type {
  AgentAddress,
  AgentAddresses,
  AgentRecord,
  AgentRosterPresentation,
  ChainType,
  EncryptedBlob,
  StoredAgent,
  StoredIdentity,
  UnlockedIdentity,
  WalletControlPresentation,
  WalletControlSignature,
};

export {
  agentAddressList,
  buildAgentRoster,
  buildWalletControlClaim,
  createMnemonic,
  decryptMnemonic,
  deriveAgentAddresses,
  deriveIdentityHandle,
  derivePrivateKeys,
  encryptMnemonic,
  isValidMnemonic,
  mnemonicToSeed,
  pathFor,
  rosterIdentityHandleFor,
  signMessageWithAgentKeys,
  verifyEthereumEip191,
  verifyBitcoinSaysoV1,
  verifyRippleSaysoV1,
  verifyStellarSaysoV1,
  verifySaysoChainSignature,
  EIP191_SCHEME,
  SAYSO_BITCOIN_SCHEME,
  SAYSO_RIPPLE_SCHEME,
  SAYSO_STELLAR_SCHEME,
  BTC_PATH,
  ETH_PATH,
  XLM_PATH,
  XRP_PATH,
};

const randomId = (): string => {
  const crypto = (globalThis as { crypto?: Crypto }).crypto;
  if (crypto?.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto?.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

export type CreateIdentityInput = {
  label?: string;
  strength?: MnemonicStrength;
  passphrase?: string;       // BIP-39 passphrase, part of the identity
  encryptionPassphrase?: string; // separate passphrase to encrypt the mnemonic blob
  now?: () => Date;
};

export type ImportIdentityInput = Omit<CreateIdentityInput, "strength"> & {
  mnemonic: string;
};

const buildStored = async (
  mnemonic: string,
  options: { label?: string; passphrase?: string; encryptionPassphrase?: string; now?: () => Date },
): Promise<StoredIdentity> => {
  const now = options.now?.() ?? new Date();
  const identityHandle = deriveIdentityHandle(mnemonic, options.passphrase ?? "");
  return {
    id: randomId(),
    label: options.label ?? "Identity",
    createdAt: now.toISOString(),
    identityHandle,
    nextAgentIndex: 0,
    mnemonic: options.encryptionPassphrase
      ? { kind: "encrypted", blob: await encryptMnemonic(mnemonic, options.encryptionPassphrase) }
      : { kind: "plaintext", mnemonic },
  };
};

export const createIdentity = async (input: CreateIdentityInput = {}): Promise<{
  stored: StoredIdentity;
  mnemonic: string;
}> => {
  const mnemonic = createMnemonic(input.strength ?? 12);
  const stored = await buildStored(mnemonic, input);
  return { stored, mnemonic };
};

export const importIdentity = async (input: ImportIdentityInput): Promise<StoredIdentity> => {
  if (!isValidMnemonic(input.mnemonic)) throw new Error("Invalid BIP-39 mnemonic.");
  return buildStored(input.mnemonic, input);
};

export const unlockIdentity = async (
  stored: StoredIdentity,
  encryptionPassphrase?: string,
): Promise<UnlockedIdentity> => {
  if (stored.mnemonic.kind === "plaintext") {
    return { ...stored, mnemonicPlaintext: stored.mnemonic.mnemonic };
  }
  if (!encryptionPassphrase) throw new Error("Encrypted identity requires a passphrase to unlock.");
  const mnemonicPlaintext = await decryptMnemonic(stored.mnemonic.blob, encryptionPassphrase);
  return { ...stored, mnemonicPlaintext };
};

export const deriveAgentRecord = (
  unlocked: UnlockedIdentity,
  agent: StoredAgent,
  bip39Passphrase = "",
): AgentRecord => {
  if (agent.identityId !== unlocked.id) {
    throw new Error("Agent does not belong to this identity.");
  }
  return {
    ...agent,
    addresses: deriveAgentAddresses(unlocked.mnemonicPlaintext, agent.index, bip39Passphrase),
  };
};

export const nextAgent = (
  unlocked: UnlockedIdentity,
  options: { label?: string; now?: () => Date } = {},
): { agent: StoredAgent; identity: UnlockedIdentity } => {
  const index = unlocked.nextAgentIndex;
  const now = options.now?.() ?? new Date();
  const agent: StoredAgent = {
    id: randomId(),
    identityId: unlocked.id,
    index,
    label: options.label ?? `Agent ${index}`,
    createdAt: now.toISOString(),
  };
  const identity: UnlockedIdentity = { ...unlocked, nextAgentIndex: index + 1 };
  return { agent, identity };
};
