import { ed25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { base32, base58xrp, base64, bech32 } from "@scure/base";
import { privateKeyToAccount } from "viem/accounts";
import { bytesToHex, derivePrivateKeys } from "./derive.js";
import type { ChainType } from "./types.js";

export type ChainSignature = {
  type: ChainType;
  signatureScheme: string;
  signature: string;
};

const textEncoder = new TextEncoder();

// --- Scheme identifiers (these go on the wire as signatureScheme) ---

export const SAYSO_BITCOIN_SCHEME = "sayso-bitcoin-v1" as const;
export const SAYSO_RIPPLE_SCHEME = "sayso-ripple-v1" as const;
export const SAYSO_STELLAR_SCHEME = "sayso-stellar-v1" as const;
export const EIP191_SCHEME = "eip191" as const;

// --- Domain prefixes (built into the bytes that get signed) ---

const BITCOIN_DOMAIN = "sayso.identity/bitcoin/v1:";
const RIPPLE_DOMAIN = "sayso.identity/ripple/v1:";
const STELLAR_DOMAIN = "sayso.identity/stellar/v1:";

// --- Helpers ---

const concatBytes = (...chunks: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

const bytesToBigInt = (bytes: Uint8Array): bigint => {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
};

const hexToBytes = (value: string): Uint8Array => {
  const normalized = value.startsWith("0x") ? value.slice(2) : value;
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  return out;
};

const hash160 = (bytes: Uint8Array): Uint8Array => ripemd160(sha256(bytes));

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

// --- EIP-191 (Ethereum) ---
// Standard prefix is the literal byte 0x19 followed by the ASCII
// "Ethereum Signed Message:\n" plus the decimal byte-length of the message.

const eip191Hash = (message: string): Uint8Array => {
  const messageBytes = textEncoder.encode(message);
  const prefix = textEncoder.encode(`\x19Ethereum Signed Message:\n${messageBytes.length}`);
  return keccak_256(concatBytes(prefix, messageBytes));
};

const signEthereum = async (privateKey: Uint8Array, message: string): Promise<ChainSignature> => {
  const account = privateKeyToAccount(`0x${bytesToHex(privateKey)}`);
  const signature = await account.signMessage({ message });
  return { type: "ethereum", signatureScheme: EIP191_SCHEME, signature };
};

export const verifyEthereumEip191 = async (
  address: string,
  message: string,
  signature: `0x${string}`,
): Promise<boolean> => {
  const digest = eip191Hash(message);
  const sigBytes = hexToBytes(signature);
  if (sigBytes.length !== 65) return false;
  const r = bytesToBigInt(sigBytes.slice(0, 32));
  const s = bytesToBigInt(sigBytes.slice(32, 64));
  const v = sigBytes[64]!;
  const recovery = v >= 27 ? v - 27 : v;
  try {
    const sig = new secp256k1.Signature(r, s, recovery);
    const pub = sig.recoverPublicKey(digest).toBytes(false);
    const recovered = `0x${bytesToHex(keccak_256(pub.slice(1)).slice(-20))}`;
    return recovered.toLowerCase() === address.toLowerCase();
  } catch {
    return false;
  }
};

// --- secp256k1 recoverable (sayso-bitcoin-v1, sayso-ripple-v1) ---
// Sign: digest = sha256(domain || message_utf8). secp256k1 ECDSA (RFC 6979).
// Wire layout: r (32) || s (32) || recovery (1, value 0 or 1), hex-encoded.
// Verify: recover pubkey from (r, s, recovery, digest), compress it, derive
// the chain's address from the compressed pubkey, compare to the claimed
// address.

// Wire layout: r (32) || s (32) || recovery (1, value 0 or 1), hex-encoded
// (same byte order as Ethereum r||s||v). Noble v2's "recovered" format places
// the recovery byte first, so we shuffle on both sides.

const signRecoverableSecp256k1 = (privateKey: Uint8Array, message: string, domain: string): string => {
  const payload = textEncoder.encode(`${domain}${message}`);
  const digest = sha256(payload);
  const noble = secp256k1.sign(digest, privateKey, { prehash: false, format: "recovered" });
  // Noble v2 layout: (recovery, r, s). Re-pack as (r, s, recovery).
  const out = new Uint8Array(65);
  out.set(noble.subarray(1), 0);
  out[64] = noble[0]!;
  return bytesToHex(out);
};

const recoverSecp256k1Pubkey = (signatureHex: string, message: string, domain: string): Uint8Array | null => {
  const sigBytes = hexToBytes(signatureHex);
  if (sigBytes.length !== 65) return null;
  const r = bytesToBigInt(sigBytes.slice(0, 32));
  const s = bytesToBigInt(sigBytes.slice(32, 64));
  const recovery = sigBytes[64]!;
  if (recovery !== 0 && recovery !== 1) return null;
  const digest = sha256(textEncoder.encode(`${domain}${message}`));
  try {
    const sig = new secp256k1.Signature(r, s, recovery);
    return sig.recoverPublicKey(digest).toBytes(true); // compressed
  } catch {
    return null;
  }
};

// Bitcoin: P2WPKH native segwit (bech32, witness version 0).

const btcAddressFromCompressedPubkey = (pub: Uint8Array, hrp = "bc"): string => {
  const words = bech32.toWords(hash160(pub));
  return bech32.encode(hrp, [0, ...words]);
};

const signBitcoin = (privateKey: Uint8Array, message: string): ChainSignature => ({
  type: "bitcoin",
  signatureScheme: SAYSO_BITCOIN_SCHEME,
  signature: signRecoverableSecp256k1(privateKey, message, BITCOIN_DOMAIN),
});

export const verifyBitcoinSaysoV1 = (address: string, message: string, signatureHex: string): boolean => {
  const pub = recoverSecp256k1Pubkey(signatureHex, message, BITCOIN_DOMAIN);
  if (!pub) return false;
  try {
    const decoded = bech32.decode(address as `${string}1${string}`);
    if (decoded.words[0] !== 0) return false;
    const expected = btcAddressFromCompressedPubkey(pub, decoded.prefix as "bc" | "tb");
    return expected === address;
  } catch {
    return false;
  }
};

// XRP Ledger: classic r-address. version byte 0x00, hash160 of compressed
// pubkey, double-sha256 4-byte checksum, base58xrp alphabet.

const xrpAddressFromCompressedPubkey = (pub: Uint8Array): string => {
  const payload = concatBytes(Uint8Array.of(0x00), hash160(pub));
  const checksum = sha256(sha256(payload)).slice(0, 4);
  return base58xrp.encode(concatBytes(payload, checksum));
};

const signRipple = (privateKey: Uint8Array, message: string): ChainSignature => ({
  type: "ripple",
  signatureScheme: SAYSO_RIPPLE_SCHEME,
  signature: signRecoverableSecp256k1(privateKey, message, RIPPLE_DOMAIN),
});

export const verifyRippleSaysoV1 = (address: string, message: string, signatureHex: string): boolean => {
  const pub = recoverSecp256k1Pubkey(signatureHex, message, RIPPLE_DOMAIN);
  if (!pub) return false;
  return xrpAddressFromCompressedPubkey(pub) === address;
};

// Stellar: ed25519, strkey "G-address". The address embeds the ed25519
// public key directly, so verification recovers the pubkey from the address,
// not from the signature.

const STRKEY_ACCOUNT_VERSION = 6 << 3;
const STRKEY_PADDED_LEN = 56; // base32 of 35 raw bytes

const strkeyAccountToPublicKey = (address: string): Uint8Array | null => {
  if (address.length !== STRKEY_PADDED_LEN) return null;
  let raw: Uint8Array;
  try {
    raw = base32.decode(address);
  } catch {
    return null;
  }
  if (raw.length !== 35) return null;
  if (raw[0] !== STRKEY_ACCOUNT_VERSION) return null;
  const payload = raw.slice(0, 33);
  const checksum = raw.slice(33);
  const expected = crc16Xmodem(payload);
  if ((checksum[0]! | (checksum[1]! << 8)) !== expected) return null;
  return payload.slice(1);
};

const signStellar = (edSeed: Uint8Array, message: string): ChainSignature => {
  const payload = textEncoder.encode(`${STELLAR_DOMAIN}${message}`);
  const sig = ed25519.sign(payload, edSeed);
  return { type: "stellar", signatureScheme: SAYSO_STELLAR_SCHEME, signature: base64.encode(sig) };
};

export const verifyStellarSaysoV1 = (address: string, message: string, signatureBase64: string): boolean => {
  const pub = strkeyAccountToPublicKey(address);
  if (!pub) return false;
  let sig: Uint8Array;
  try {
    sig = base64.decode(signatureBase64);
  } catch {
    return false;
  }
  if (sig.length !== 64) return false;
  const payload = textEncoder.encode(`${STELLAR_DOMAIN}${message}`);
  try {
    return ed25519.verify(sig, payload, pub);
  } catch {
    return false;
  }
};

// --- Aggregate signing (used by presentations.ts) ---

export const signMessageWithAgentKeys = async (
  mnemonic: string,
  index: number,
  message: string,
  passphrase = "",
): Promise<ChainSignature[]> => {
  const keys = derivePrivateKeys(mnemonic, index, passphrase);
  return [
    await signEthereum(keys.ethereum, message),
    signBitcoin(keys.bitcoin, message),
    signRipple(keys.ripple, message),
    signStellar(keys.stellar, message),
  ];
};

// --- Single dispatch verifier (handy for consumers) ---

export const verifySaysoChainSignature = async (
  signature: ChainSignature,
  message: string,
  address: string,
): Promise<boolean> => {
  switch (signature.type) {
    case "ethereum":
      if (signature.signatureScheme !== EIP191_SCHEME) return false;
      return verifyEthereumEip191(address, message, signature.signature as `0x${string}`);
    case "bitcoin":
      if (signature.signatureScheme !== SAYSO_BITCOIN_SCHEME) return false;
      return verifyBitcoinSaysoV1(address, message, signature.signature);
    case "ripple":
      if (signature.signatureScheme !== SAYSO_RIPPLE_SCHEME) return false;
      return verifyRippleSaysoV1(address, message, signature.signature);
    case "stellar":
      if (signature.signatureScheme !== SAYSO_STELLAR_SCHEME) return false;
      return verifyStellarSaysoV1(address, message, signature.signature);
  }
};
