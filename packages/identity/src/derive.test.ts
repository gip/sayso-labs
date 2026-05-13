import { describe, expect, it } from "vitest";
import { mnemonicToAccount } from "viem/accounts";
import {
  BTC_PATH,
  ETH_PATH,
  XLM_PATH,
  XRP_PATH,
  agentAddressList,
  deriveAgentAddresses,
  deriveIdentityHandle,
  derivePrivateKeys,
  pathFor,
} from "./derive.js";

const TEST_MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const SEP5_MNEMONIC = "illness spike retreat truth genius clock brain pass fit cave bargain toe";

describe("derive", () => {
  it("derives all four address types for index 0", () => {
    const addr = deriveAgentAddresses(TEST_MNEMONIC, 0);
    expect(addr.ethereum.address).toMatch(/^0x[0-9a-f]{40}$/);
    expect(addr.bitcoin.address).toMatch(/^bc1[0-9a-z]+$/);
    expect(addr.ripple.address).toMatch(/^r[1-9A-HJ-NP-Za-km-z]+$/);
    expect(addr.stellar.address).toMatch(/^G[A-Z2-7]+$/);
    expect(addr.ethereum.derivationPath).toBe(ETH_PATH(0));
    expect(addr.bitcoin.derivationPath).toBe(BTC_PATH(0));
    expect(addr.ripple.derivationPath).toBe(XRP_PATH(0));
    expect(addr.stellar.derivationPath).toBe(XLM_PATH(0));
  });

  it("is deterministic — same mnemonic + index → same addresses", () => {
    const a = deriveAgentAddresses(TEST_MNEMONIC, 0);
    const b = deriveAgentAddresses(TEST_MNEMONIC, 0);
    expect(a).toEqual(b);
  });

  it("produces different addresses for different agent indexes", () => {
    const a = deriveAgentAddresses(TEST_MNEMONIC, 0);
    const b = deriveAgentAddresses(TEST_MNEMONIC, 1);
    expect(a.ethereum.address).not.toBe(b.ethereum.address);
    expect(a.bitcoin.address).not.toBe(b.bitcoin.address);
    expect(a.ripple.address).not.toBe(b.ripple.address);
    expect(a.stellar.address).not.toBe(b.stellar.address);
  });

  it("ETH derivation matches viem's mnemonicToAccount for the same path", () => {
    for (const n of [0, 1, 7, 42]) {
      const ours = deriveAgentAddresses(TEST_MNEMONIC, n).ethereum.address;
      const viem = mnemonicToAccount(TEST_MNEMONIC, { accountIndex: n, addressIndex: 0 }).address.toLowerCase();
      expect(ours).toBe(viem);
    }
  });

  it("BTC matches BIP-84 abandon-vector address (m/84'/0'/0'/0/0)", () => {
    // BIP-84 canonical test vector
    const addr = deriveAgentAddresses(TEST_MNEMONIC, 0).bitcoin.address;
    expect(addr).toBe("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu");
  });

  it("XLM matches SEP-5 test vector for illness/spike/... at m/44'/148'/0'", () => {
    const addr = deriveAgentAddresses(SEP5_MNEMONIC, 0).stellar.address;
    expect(addr).toBe("GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSUJUJ6");
  });

  it("identityHandle is stable across calls and depends on mnemonic", () => {
    const h1 = deriveIdentityHandle(TEST_MNEMONIC);
    const h2 = deriveIdentityHandle(TEST_MNEMONIC);
    const h3 = deriveIdentityHandle(SEP5_MNEMONIC);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1.startsWith("sayso:identity:")).toBe(true);
  });

  it("pathFor returns the right path per chain", () => {
    expect(pathFor("ethereum", 3)).toBe(ETH_PATH(3));
    expect(pathFor("bitcoin", 3)).toBe(BTC_PATH(3));
    expect(pathFor("ripple", 3)).toBe(XRP_PATH(3));
    expect(pathFor("stellar", 3)).toBe(XLM_PATH(3));
  });

  it("agentAddressList yields all four entries in fixed order", () => {
    const list = agentAddressList(deriveAgentAddresses(TEST_MNEMONIC, 0));
    expect(list.map((entry) => entry.type)).toEqual(["ethereum", "bitcoin", "ripple", "stellar"]);
  });

  it("derivePrivateKeys yields 32-byte material per chain", () => {
    const keys = derivePrivateKeys(TEST_MNEMONIC, 0);
    expect(keys.ethereum.length).toBe(32);
    expect(keys.bitcoin.length).toBe(32);
    expect(keys.ripple.length).toBe(32);
    expect(keys.stellar.length).toBe(32);
  });

  it("rejects out-of-range indexes", () => {
    expect(() => deriveAgentAddresses(TEST_MNEMONIC, -1)).toThrow(/Invalid agent index/);
    expect(() => deriveAgentAddresses(TEST_MNEMONIC, 2 ** 31)).toThrow(/Invalid agent index/);
  });
});
