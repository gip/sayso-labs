import { ed25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { base64 } from "@scure/base";
import { privateKeyToAccount } from "viem/accounts";
import { bytesToHex, derivePrivateKeys } from "./derive.js";
import type { ChainType } from "./types.js";

export type ChainSignature = {
  type: ChainType;
  signatureScheme: string;
  signature: string;
};

const textEncoder = new TextEncoder();

const eip191Hash = (message: string): Uint8Array => {
  const prefix = textEncoder.encode(`Ethereum Signed Message:\n${message.length}`);
  const payload = new Uint8Array(prefix.length + textEncoder.encode(message).length);
  payload.set(prefix);
  payload.set(textEncoder.encode(message), prefix.length);
  return keccak_256(payload);
};

const signEthereum = async (privateKey: Uint8Array, message: string): Promise<ChainSignature> => {
  const account = privateKeyToAccount(`0x${bytesToHex(privateKey)}`);
  const signature = await account.signMessage({ message });
  return { type: "ethereum", signatureScheme: "eip191", signature };
};

const signWithDomain = (privateKey: Uint8Array, message: string, domain: string): Uint8Array => {
  const payload = textEncoder.encode(`${domain}:${message}`);
  return secp256k1.sign(payload, privateKey);
};

const signBitcoin = (privateKey: Uint8Array, message: string): ChainSignature => {
  const sig = signWithDomain(privateKey, message, "sayso.identity/btc/v1");
  return {
    type: "bitcoin",
    signatureScheme: "sayso-secp256k1-sha256/v1",
    signature: bytesToHex(sig),
  };
};

const signRipple = (privateKey: Uint8Array, message: string): ChainSignature => {
  const sig = signWithDomain(privateKey, message, "sayso.identity/xrp/v1");
  return {
    type: "ripple",
    signatureScheme: "sayso-secp256k1-sha256/v1",
    signature: bytesToHex(sig),
  };
};

const signStellar = (edSeed: Uint8Array, message: string): ChainSignature => {
  const payload = textEncoder.encode(`sayso.identity/xlm/v1:${message}`);
  const sig = ed25519.sign(payload, edSeed);
  return {
    type: "stellar",
    signatureScheme: "sayso-ed25519/v1",
    signature: base64.encode(sig),
  };
};

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
