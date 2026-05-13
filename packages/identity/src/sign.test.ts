import { describe, expect, it } from "vitest";
import { deriveAgentAddresses } from "./derive.js";
import {
  EIP191_SCHEME,
  SAYSO_BITCOIN_SCHEME,
  SAYSO_RIPPLE_SCHEME,
  SAYSO_STELLAR_SCHEME,
  signMessageWithAgentKeys,
  verifyBitcoinSaysoV1,
  verifyEthereumEip191,
  verifyRippleSaysoV1,
  verifySaysoChainSignature,
  verifyStellarSaysoV1,
} from "./sign.js";

const TEST_MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("sign", () => {
  it("produces one signature per chain in canonical order with pinned scheme strings", async () => {
    const sigs = await signMessageWithAgentKeys(TEST_MNEMONIC, 0, "hello");
    expect(sigs.map((s) => s.type)).toEqual(["ethereum", "bitcoin", "ripple", "stellar"]);
    expect(sigs[0]!.signatureScheme).toBe(EIP191_SCHEME);
    expect(sigs[1]!.signatureScheme).toBe(SAYSO_BITCOIN_SCHEME);
    expect(sigs[2]!.signatureScheme).toBe(SAYSO_RIPPLE_SCHEME);
    expect(sigs[3]!.signatureScheme).toBe(SAYSO_STELLAR_SCHEME);
  });

  it("ETH EIP-191 signature round-trips through the verifier", async () => {
    const sigs = await signMessageWithAgentKeys(TEST_MNEMONIC, 0, "test message");
    const ethSig = sigs.find((s) => s.type === "ethereum")!;
    const addr = deriveAgentAddresses(TEST_MNEMONIC, 0).ethereum.address;
    expect(await verifyEthereumEip191(addr, "test message", ethSig.signature as `0x${string}`)).toBe(true);
  });

  it("ETH EIP-191 verifier rejects a different message", async () => {
    const sigs = await signMessageWithAgentKeys(TEST_MNEMONIC, 0, "test message");
    const ethSig = sigs.find((s) => s.type === "ethereum")!;
    const addr = deriveAgentAddresses(TEST_MNEMONIC, 0).ethereum.address;
    expect(await verifyEthereumEip191(addr, "different", ethSig.signature as `0x${string}`)).toBe(false);
  });

  it("BTC sayso-bitcoin-v1 round-trips and emits 65 bytes (r||s||v)", async () => {
    const message = "btc round trip";
    const sigs = await signMessageWithAgentKeys(TEST_MNEMONIC, 0, message);
    const btcSig = sigs.find((s) => s.type === "bitcoin")!;
    expect(btcSig.signature).toMatch(/^[0-9a-f]{130}$/);
    const addr = deriveAgentAddresses(TEST_MNEMONIC, 0).bitcoin.address;
    expect(verifyBitcoinSaysoV1(addr, message, btcSig.signature)).toBe(true);
  });

  it("BTC verifier rejects a tampered message, wrong address, and a malformed signature", async () => {
    const sigs = await signMessageWithAgentKeys(TEST_MNEMONIC, 0, "anchor");
    const btcSig = sigs.find((s) => s.type === "bitcoin")!;
    const addr = deriveAgentAddresses(TEST_MNEMONIC, 0).bitcoin.address;
    const otherAddr = deriveAgentAddresses(TEST_MNEMONIC, 1).bitcoin.address;
    expect(verifyBitcoinSaysoV1(addr, "tampered", btcSig.signature)).toBe(false);
    expect(verifyBitcoinSaysoV1(otherAddr, "anchor", btcSig.signature)).toBe(false);
    expect(verifyBitcoinSaysoV1(addr, "anchor", "deadbeef")).toBe(false);
  });

  it("XRP sayso-ripple-v1 round-trips and emits 65 bytes (r||s||v)", async () => {
    const message = "xrp round trip";
    const sigs = await signMessageWithAgentKeys(TEST_MNEMONIC, 0, message);
    const xrpSig = sigs.find((s) => s.type === "ripple")!;
    expect(xrpSig.signature).toMatch(/^[0-9a-f]{130}$/);
    const addr = deriveAgentAddresses(TEST_MNEMONIC, 0).ripple.address;
    expect(verifyRippleSaysoV1(addr, message, xrpSig.signature)).toBe(true);
  });

  it("XRP verifier rejects a tampered message and a different agent's address", async () => {
    const sigs = await signMessageWithAgentKeys(TEST_MNEMONIC, 0, "anchor");
    const xrpSig = sigs.find((s) => s.type === "ripple")!;
    const addr = deriveAgentAddresses(TEST_MNEMONIC, 0).ripple.address;
    const otherAddr = deriveAgentAddresses(TEST_MNEMONIC, 1).ripple.address;
    expect(verifyRippleSaysoV1(addr, "tampered", xrpSig.signature)).toBe(false);
    expect(verifyRippleSaysoV1(otherAddr, "anchor", xrpSig.signature)).toBe(false);
  });

  it("XLM sayso-stellar-v1 round-trips and emits a base64-encoded 64-byte signature", async () => {
    const message = "xlm round trip";
    const sigs = await signMessageWithAgentKeys(TEST_MNEMONIC, 0, message);
    const xlmSig = sigs.find((s) => s.type === "stellar")!;
    // 64 raw bytes = 88 chars of base64 (with padding) or 86 (without). @scure/base emits with padding.
    expect(xlmSig.signature.length).toBeGreaterThanOrEqual(86);
    const addr = deriveAgentAddresses(TEST_MNEMONIC, 0).stellar.address;
    expect(verifyStellarSaysoV1(addr, message, xlmSig.signature)).toBe(true);
  });

  it("XLM verifier rejects a tampered message and a different agent's address", async () => {
    const sigs = await signMessageWithAgentKeys(TEST_MNEMONIC, 0, "anchor");
    const xlmSig = sigs.find((s) => s.type === "stellar")!;
    const addr = deriveAgentAddresses(TEST_MNEMONIC, 0).stellar.address;
    const otherAddr = deriveAgentAddresses(TEST_MNEMONIC, 1).stellar.address;
    expect(verifyStellarSaysoV1(addr, "tampered", xlmSig.signature)).toBe(false);
    expect(verifyStellarSaysoV1(otherAddr, "anchor", xlmSig.signature)).toBe(false);
  });

  it("verifySaysoChainSignature dispatches to the right verifier per chain", async () => {
    const message = "dispatch test";
    const sigs = await signMessageWithAgentKeys(TEST_MNEMONIC, 0, message);
    const addresses = deriveAgentAddresses(TEST_MNEMONIC, 0);
    const addrByType = {
      ethereum: addresses.ethereum.address,
      bitcoin: addresses.bitcoin.address,
      ripple: addresses.ripple.address,
      stellar: addresses.stellar.address,
    } as const;
    for (const sig of sigs) {
      expect(await verifySaysoChainSignature(sig, message, addrByType[sig.type])).toBe(true);
    }
  });

  it("verifySaysoChainSignature rejects a signature whose scheme string does not match its type", async () => {
    const sigs = await signMessageWithAgentKeys(TEST_MNEMONIC, 0, "scheme mismatch");
    const btcSig = sigs.find((s) => s.type === "bitcoin")!;
    const tampered = { ...btcSig, signatureScheme: "eip191" };
    const addr = deriveAgentAddresses(TEST_MNEMONIC, 0).bitcoin.address;
    expect(await verifySaysoChainSignature(tampered, "scheme mismatch", addr)).toBe(false);
  });
});
