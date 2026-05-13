import { describe, expect, it } from "vitest";
import { decryptMnemonic, encryptMnemonic } from "./encrypt.js";

describe("encrypt", () => {
  it("round-trips a mnemonic through encrypt/decrypt with the same passphrase", async () => {
    const mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const blob = await encryptMnemonic(mnemonic, "correct horse battery staple");
    expect(blob.kdf).toBe("pbkdf2-sha256");
    expect(blob.iterations).toBeGreaterThanOrEqual(600_000);
    const restored = await decryptMnemonic(blob, "correct horse battery staple");
    expect(restored).toBe(mnemonic);
  });

  it("fails to decrypt with the wrong passphrase", async () => {
    const mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const blob = await encryptMnemonic(mnemonic, "right");
    await expect(decryptMnemonic(blob, "wrong")).rejects.toThrow(/decrypt/i);
  });

  it("produces a fresh ciphertext each time (non-deterministic iv/salt)", async () => {
    const mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const a = await encryptMnemonic(mnemonic, "pw");
    const b = await encryptMnemonic(mnemonic, "pw");
    expect(a.iv).not.toBe(b.iv);
    expect(a.salt).not.toBe(b.salt);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("refuses to encrypt with an empty passphrase", async () => {
    await expect(encryptMnemonic("anything", "")).rejects.toThrow(/non-empty/);
  });
});
