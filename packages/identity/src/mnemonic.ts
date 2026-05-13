import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

export type MnemonicStrength = 12 | 24;

const STRENGTH_BITS: Record<MnemonicStrength, number> = { 12: 128, 24: 256 };

export const createMnemonic = (strength: MnemonicStrength = 12): string =>
  generateMnemonic(wordlist, STRENGTH_BITS[strength]);

export const isValidMnemonic = (mnemonic: string): boolean =>
  validateMnemonic(mnemonic.trim(), wordlist);

export const mnemonicToSeed = (mnemonic: string, passphrase = ""): Uint8Array => {
  const trimmed = mnemonic.trim();
  if (!validateMnemonic(trimmed, wordlist)) {
    throw new Error("Invalid BIP-39 mnemonic.");
  }
  return mnemonicToSeedSync(trimmed, passphrase);
};
