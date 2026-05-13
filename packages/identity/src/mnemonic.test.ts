import { describe, expect, it } from "vitest";
import { createMnemonic, isValidMnemonic, mnemonicToSeed } from "./mnemonic.js";

describe("mnemonic", () => {
  it("generates a valid 12-word mnemonic by default", () => {
    const mnemonic = createMnemonic();
    expect(mnemonic.split(/\s+/).length).toBe(12);
    expect(isValidMnemonic(mnemonic)).toBe(true);
  });

  it("generates a valid 24-word mnemonic when requested", () => {
    const mnemonic = createMnemonic(24);
    expect(mnemonic.split(/\s+/).length).toBe(24);
    expect(isValidMnemonic(mnemonic)).toBe(true);
  });

  it("rejects invalid mnemonics", () => {
    expect(isValidMnemonic("not a real mnemonic")).toBe(false);
    expect(() => mnemonicToSeed("not a real mnemonic")).toThrow(/Invalid/);
  });

  it("derives different seeds for different passphrases", () => {
    const mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const seedA = mnemonicToSeed(mnemonic, "");
    const seedB = mnemonicToSeed(mnemonic, "passphrase");
    expect(seedA).not.toEqual(seedB);
  });
});
