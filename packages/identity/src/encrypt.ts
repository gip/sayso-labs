import { base64 } from "@scure/base";
import type { EncryptedBlob } from "./types.js";

const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;

const getSubtle = (): SubtleCrypto => {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) throw new Error("WebCrypto SubtleCrypto is not available in this environment.");
  return subtle;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const deriveKey = async (passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> => {
  const subtle = getSubtle();
  const baseKey = await subtle.importKey(
    "raw",
    textEncoder.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: KEY_BYTES * 8 },
    false,
    ["encrypt", "decrypt"],
  );
};

const randomBytes = (length: number): Uint8Array => {
  const out = new Uint8Array(length);
  (globalThis.crypto ?? (globalThis as { crypto: Crypto }).crypto).getRandomValues(out);
  return out;
};

export const encryptMnemonic = async (mnemonic: string, passphrase: string): Promise<EncryptedBlob> => {
  if (!passphrase) throw new Error("Passphrase must be non-empty to encrypt a mnemonic.");
  const subtle = getSubtle();
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const cipherBuf = await subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, textEncoder.encode(mnemonic));
  return {
    kdf: "pbkdf2-sha256",
    iterations: PBKDF2_ITERATIONS,
    salt: base64.encode(salt),
    iv: base64.encode(iv),
    ciphertext: base64.encode(new Uint8Array(cipherBuf)),
  };
};

export const decryptMnemonic = async (blob: EncryptedBlob, passphrase: string): Promise<string> => {
  if (blob.kdf !== "pbkdf2-sha256") throw new Error(`Unsupported KDF: ${blob.kdf}`);
  const subtle = getSubtle();
  const salt = base64.decode(blob.salt);
  const iv = base64.decode(blob.iv);
  const ciphertext = base64.decode(blob.ciphertext);
  const key = await deriveKey(passphrase, salt, blob.iterations);
  try {
    const plainBuf = await subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ciphertext as BufferSource);
    return textDecoder.decode(plainBuf);
  } catch {
    throw new Error("Failed to decrypt mnemonic: wrong passphrase or corrupted blob.");
  }
};
