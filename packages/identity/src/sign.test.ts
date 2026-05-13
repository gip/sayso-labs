import { describe, expect, it } from "vitest";
import { deriveAgentAddresses } from "./derive.js";
import { signMessageWithAgentKeys, verifyEthereumEip191 } from "./sign.js";

const TEST_MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("sign", () => {
  it("produces one signature per chain in canonical order", async () => {
    const sigs = await signMessageWithAgentKeys(TEST_MNEMONIC, 0, "hello");
    expect(sigs.map((s) => s.type)).toEqual(["ethereum", "bitcoin", "ripple", "stellar"]);
    for (const sig of sigs) expect(sig.signature.length).toBeGreaterThan(0);
  });

  it("EIP-191 signature verifies against the derived ETH address", async () => {
    const sigs = await signMessageWithAgentKeys(TEST_MNEMONIC, 0, "test message");
    const ethSig = sigs.find((s) => s.type === "ethereum");
    expect(ethSig).toBeDefined();
    const addr = deriveAgentAddresses(TEST_MNEMONIC, 0).ethereum.address;
    const ok = await verifyEthereumEip191(addr, "test message", ethSig!.signature as `0x${string}`);
    expect(ok).toBe(true);
  });

  it("EIP-191 verification rejects a different message", async () => {
    const sigs = await signMessageWithAgentKeys(TEST_MNEMONIC, 0, "test message");
    const ethSig = sigs.find((s) => s.type === "ethereum")!;
    const addr = deriveAgentAddresses(TEST_MNEMONIC, 0).ethereum.address;
    const ok = await verifyEthereumEip191(addr, "different", ethSig.signature as `0x${string}`);
    expect(ok).toBe(false);
  });
});
