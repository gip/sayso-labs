import { HDKey } from "@scure/bip32";
import { ed25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { base32, base58xrp, bech32 } from "@scure/base";
import { privateKeyToAccount } from "viem/accounts";
import { mnemonicToSeed } from "./mnemonic.js";
import type { AgentAddress, AgentAddresses, ChainType } from "./types.js";

const textEncoder = new TextEncoder();

export const ETH_PATH = (n: number) => `m/44'/60'/${n}'/0/0`;
export const BTC_PATH = (n: number) => `m/84'/0'/${n}'/0/0`;
export const XRP_PATH = (n: number) => `m/44'/144'/${n}'/0/0`;
export const XLM_PATH = (n: number) => `m/44'/148'/${n}'`;

export const pathFor = (chain: ChainType, index: number): string => {
  switch (chain) {
    case "ethereum": return ETH_PATH(index);
    case "bitcoin":  return BTC_PATH(index);
    case "ripple":   return XRP_PATH(index);
    case "stellar":  return XLM_PATH(index);
  }
};

export const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const hash160 = (bytes: Uint8Array): Uint8Array => ripemd160(sha256(bytes));

const concatBytes = (...chunks: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

const crc16Xmodem = (bytes: Uint8Array): number => {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
};

// ---- secp256k1: ETH / BTC / XRP via @scure/bip32 ----

const deriveSecp256k1PrivateKey = (seed: Uint8Array, path: string): Uint8Array => {
  const root = HDKey.fromMasterSeed(seed);
  const node = root.derive(path);
  if (!node.privateKey) throw new Error(`BIP-32 derivation produced no private key for ${path}.`);
  return node.privateKey;
};

const ethAddressFromPrivateKey = (pk: Uint8Array): `0x${string}` =>
  privateKeyToAccount(`0x${bytesToHex(pk)}`).address.toLowerCase() as `0x${string}`;

const btcAddressFromPrivateKey = (pk: Uint8Array): string => {
  const publicKey = secp256k1.getPublicKey(pk, true);
  const words = bech32.toWords(hash160(publicKey));
  return bech32.encode("bc", [0, ...words]);
};

const xrpAddressFromPrivateKey = (pk: Uint8Array): string => {
  const publicKey = secp256k1.getPublicKey(pk, true);
  const payload = concatBytes(Uint8Array.of(0x00), hash160(publicKey));
  const checksum = sha256(sha256(payload)).slice(0, 4);
  return base58xrp.encode(concatBytes(payload, checksum));
};

// ---- ed25519 SLIP-10: XLM ----
// SEP-5 mandates hardened-only paths for Stellar, so this implementation
// rejects any non-hardened step.

const SLIP10_ED25519_MASTER_KEY = textEncoder.encode("ed25519 seed");
const HARDENED_OFFSET = 0x80000000;

const parsePath = (path: string): number[] => {
  if (!path.startsWith("m/")) throw new Error(`Invalid HD path: ${path}`);
  const segments = path.slice(2).split("/");
  return segments.map((segment) => {
    const hardened = segment.endsWith("'");
    const raw = hardened ? segment.slice(0, -1) : segment;
    const idx = Number.parseInt(raw, 10);
    if (!Number.isInteger(idx) || idx < 0 || idx >= HARDENED_OFFSET) {
      throw new Error(`Invalid HD path segment: ${segment}`);
    }
    if (!hardened) {
      throw new Error(`SLIP-10 ed25519 requires hardened segments only: ${path}`);
    }
    return idx + HARDENED_OFFSET;
  });
};

const slip10Ed25519FromSeed = (seed: Uint8Array, path: string): Uint8Array => {
  const I = hmac(sha512, SLIP10_ED25519_MASTER_KEY, seed);
  let key = I.slice(0, 32);
  let chainCode = I.slice(32);
  for (const index of parsePath(path)) {
    const data = new Uint8Array(1 + 32 + 4);
    data[0] = 0x00;
    data.set(key, 1);
    data[33] = (index >>> 24) & 0xff;
    data[34] = (index >>> 16) & 0xff;
    data[35] = (index >>> 8) & 0xff;
    data[36] = index & 0xff;
    const child = hmac(sha512, chainCode, data);
    key = child.slice(0, 32);
    chainCode = child.slice(32);
  }
  return key;
};

const xlmAddressFromSeed = (ed25519Seed: Uint8Array): string => {
  const publicKey = ed25519.getPublicKey(ed25519Seed);
  const versionByte = 6 << 3; // strkey "G" account version
  const payload = concatBytes(Uint8Array.of(versionByte), publicKey);
  const checksum = crc16Xmodem(payload);
  const checksumBytes = Uint8Array.of(checksum & 0xff, (checksum >> 8) & 0xff);
  return base32.encode(concatBytes(payload, checksumBytes)).replaceAll("=", "");
};

// ---- Public surface ----

export type PrivateKeyMaterial = {
  ethereum: Uint8Array;
  bitcoin: Uint8Array;
  ripple: Uint8Array;
  stellar: Uint8Array;
};

export const derivePrivateKeys = (
  mnemonic: string,
  index: number,
  passphrase = "",
): PrivateKeyMaterial => {
  if (!Number.isInteger(index) || index < 0 || index >= HARDENED_OFFSET) {
    throw new Error(`Invalid agent index: ${index}`);
  }
  const seed = mnemonicToSeed(mnemonic, passphrase);
  return {
    ethereum: deriveSecp256k1PrivateKey(seed, ETH_PATH(index)),
    bitcoin:  deriveSecp256k1PrivateKey(seed, BTC_PATH(index)),
    ripple:   deriveSecp256k1PrivateKey(seed, XRP_PATH(index)),
    stellar:  slip10Ed25519FromSeed(seed, XLM_PATH(index)),
  };
};

export const deriveAgentAddresses = (
  mnemonic: string,
  index: number,
  passphrase = "",
): AgentAddresses => {
  const keys = derivePrivateKeys(mnemonic, index, passphrase);
  return {
    ethereum: {
      type: "ethereum",
      address: ethAddressFromPrivateKey(keys.ethereum),
      derivationPath: ETH_PATH(index),
    },
    bitcoin: {
      type: "bitcoin",
      address: btcAddressFromPrivateKey(keys.bitcoin),
      derivationPath: BTC_PATH(index),
    },
    ripple: {
      type: "ripple",
      address: xrpAddressFromPrivateKey(keys.ripple),
      derivationPath: XRP_PATH(index),
    },
    stellar: {
      type: "stellar",
      address: xlmAddressFromSeed(keys.stellar),
      derivationPath: XLM_PATH(index),
    },
  };
};

export const agentAddressList = (addresses: AgentAddresses): AgentAddress[] =>
  [addresses.ethereum, addresses.bitcoin, addresses.ripple, addresses.stellar];

export const deriveIdentityHandle = (mnemonic: string, passphrase = ""): string => {
  const seed = mnemonicToSeed(mnemonic, passphrase);
  const root = HDKey.fromMasterSeed(seed);
  if (!root.publicKey) throw new Error("BIP-32 master node missing public key.");
  const digest = sha256(root.publicKey);
  return `sayso:identity:${base32.encode(digest).replaceAll("=", "").slice(0, 26).toLowerCase()}`;
};
