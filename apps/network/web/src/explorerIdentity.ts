import { ed25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base32, base58xrp, bech32 } from "@scure/base";
import { privateKeyToAccount } from "viem/accounts";

const textEncoder = new TextEncoder();
const seedBytes = 32;

const derivationLabels = {
  eth: "sayso-network-explorer/eth/secp256k1/v1",
  btc: "sayso-network-explorer/btc/secp256k1/v1",
  xrp: "sayso-network-explorer/xrp/secp256k1/v1",
  xlm: "sayso-network-explorer/xlm/ed25519/v1",
} as const;

export type ExplorerChain = keyof typeof derivationLabels;

export type ExplorerAddresses = Record<ExplorerChain, string>;

export type StoredExplorerIdentity = {
  id: string;
  seedHex: string;
  createdAt: string;
};

export type ExplorerIdentity = StoredExplorerIdentity & {
  addresses: ExplorerAddresses;
  ethPrivateKey: `0x${string}`;
};

export const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

export const hexToBytes = (value: string) => {
  const normalized = value.startsWith("0x") ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error("Expected an even-length hex string.");
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
};

const concatBytes = (...chunks: Uint8Array[]) => {
  const output = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
};

const hash160 = (bytes: Uint8Array) => ripemd160(sha256(bytes));

const deriveBytes = (seed: Uint8Array, label: string, counter = 0) =>
  hmac(sha256, seed, textEncoder.encode(`${label}/${counter}`));

export const deriveSecp256k1PrivateKey = (seedHex: string, chain: Extract<ExplorerChain, "eth" | "btc" | "xrp">) => {
  const seed = hexToBytes(seedHex);
  if (seed.length !== seedBytes) throw new Error("Explorer identity seed must be 32 bytes.");
  for (let counter = 0; counter < 256; counter += 1) {
    const candidate = deriveBytes(seed, derivationLabels[chain], counter);
    if (secp256k1.utils.isValidSecretKey(candidate)) return candidate;
  }
  throw new Error(`Unable to derive a valid ${chain} secp256k1 private key.`);
};

export const deriveEd25519Seed = (seedHex: string, chain: Extract<ExplorerChain, "xlm">) => {
  const seed = hexToBytes(seedHex);
  if (seed.length !== seedBytes) throw new Error("Explorer identity seed must be 32 bytes.");
  return deriveBytes(seed, derivationLabels[chain]);
};

const btcAddressFromPrivateKey = (privateKey: Uint8Array) => {
  const publicKey = secp256k1.getPublicKey(privateKey, true);
  const words = bech32.toWords(hash160(publicKey));
  return bech32.encode("bc", [0, ...words]);
};

const xrpAddressFromPrivateKey = (privateKey: Uint8Array) => {
  const publicKey = secp256k1.getPublicKey(privateKey, true);
  const payload = concatBytes(Uint8Array.of(0), hash160(publicKey));
  const checksum = sha256(sha256(payload)).slice(0, 4);
  return base58xrp.encode(concatBytes(payload, checksum));
};

const crc16Xmodem = (bytes: Uint8Array) => {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
};

const xlmAddressFromSeed = (seed: Uint8Array) => {
  const publicKey = ed25519.getPublicKey(seed);
  const payload = concatBytes(Uint8Array.of(6 << 3), publicKey);
  const checksum = crc16Xmodem(payload);
  return base32.encode(concatBytes(payload, Uint8Array.of(checksum & 0xff, checksum >> 8))).replaceAll("=", "");
};

export const deriveExplorerIdentity = (stored: StoredExplorerIdentity): ExplorerIdentity => {
  const ethPrivateKeyBytes = deriveSecp256k1PrivateKey(stored.seedHex, "eth");
  const ethPrivateKey = `0x${bytesToHex(ethPrivateKeyBytes)}` as const;
  const eth = privateKeyToAccount(ethPrivateKey).address.toLowerCase();
  return {
    ...stored,
    addresses: {
      eth,
      btc: btcAddressFromPrivateKey(deriveSecp256k1PrivateKey(stored.seedHex, "btc")),
      xrp: xrpAddressFromPrivateKey(deriveSecp256k1PrivateKey(stored.seedHex, "xrp")),
      xlm: xlmAddressFromSeed(deriveEd25519Seed(stored.seedHex, "xlm")),
    },
    ethPrivateKey,
  };
};

export const createStoredExplorerIdentity = (): StoredExplorerIdentity => {
  const seed = new Uint8Array(seedBytes);
  crypto.getRandomValues(seed);
  return {
    id: crypto.randomUUID(),
    seedHex: bytesToHex(seed),
    createdAt: new Date().toISOString(),
  };
};
