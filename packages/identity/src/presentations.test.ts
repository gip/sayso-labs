import { describe, expect, it } from "vitest";
import { deriveAgentAddresses, deriveIdentityHandle } from "./derive.js";
import { buildAgentRoster, buildWalletControlClaim } from "./presentations.js";
import { verifyEthereumEip191 } from "./sign.js";

const TEST_MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("presentations", () => {
  it("builds a roster payload that matches the wire shape", () => {
    const handle = deriveIdentityHandle(TEST_MNEMONIC);
    const roster = buildAgentRoster(
      handle,
      [
        { index: 0, label: "Default", addresses: deriveAgentAddresses(TEST_MNEMONIC, 0) },
        { index: 1, addresses: deriveAgentAddresses(TEST_MNEMONIC, 1) },
      ],
      "2026-05-12T00:00:00.000Z",
    );
    expect(roster.type).toBe("sayso.identity.agent-roster");
    expect(roster.payload.identityHandle).toBe(handle);
    expect(roster.payload.agents).toHaveLength(2);
    expect(roster.payload.agents[0]!.label).toBe("Default");
    expect(roster.payload.agents[1]!.label).toBeUndefined();
    expect(roster.payload.agents[0]!.addresses.map((a) => a.type)).toEqual([
      "ethereum",
      "bitcoin",
      "ripple",
      "stellar",
    ]);
    expect(roster.payload.timestamp).toBe("2026-05-12T00:00:00.000Z");
  });

  it("builds a wallet-control claim that round-trips through ETH verification", async () => {
    const claim = await buildWalletControlClaim(TEST_MNEMONIC, [0, 1], {
      timestamp: "2026-05-12T00:00:00.000Z",
    });
    expect(claim.type).toBe("sayso.claim.wallet-control");
    expect(claim.payload.message.wallets).toHaveLength(8); // 2 agents * 4 chains
    expect(claim.payload.signatures.length).toBe(8);

    const message = JSON.stringify(claim.payload.message);
    const ethSigs = claim.payload.signatures.filter((s) => s.type === "ethereum");
    expect(ethSigs.length).toBe(2);
    for (const sig of ethSigs) {
      const ok = await verifyEthereumEip191(sig.address, message, sig.signature as `0x${string}`);
      expect(ok).toBe(true);
    }
  });

  it("limits the wallet-control claim to requested chains", async () => {
    const claim = await buildWalletControlClaim(TEST_MNEMONIC, [0], { chains: ["ethereum", "bitcoin"] });
    expect(claim.payload.message.wallets.map((w) => w.type)).toEqual(["ethereum", "bitcoin"]);
    expect(claim.payload.signatures.map((s) => s.type)).toEqual(["ethereum", "bitcoin"]);
  });
});
