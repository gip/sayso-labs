import { describe, expect, it } from "vitest";
import {
  deriveEd25519Seed,
  deriveExplorerIdentity,
  deriveSecp256k1PrivateKey,
  type StoredExplorerIdentity,
} from "./explorerIdentity.js";

const stored = (seedHex: string): StoredExplorerIdentity => ({
  id: `id_${seedHex.slice(0, 8)}`,
  seedHex,
  createdAt: "2026-05-03T00:00:00.000Z",
});

describe("explorer identity derivation", () => {
  it("derives all chain addresses deterministically from one 32-byte seed", () => {
    const seedHex = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    const first = deriveExplorerIdentity(stored(seedHex));
    const second = deriveExplorerIdentity(stored(seedHex));

    expect(first.addresses).toEqual(second.addresses);
    expect(first.ethPrivateKey).toBe(second.ethPrivateKey);
    expect(first.addresses.eth).toMatch(/^0x[0-9a-f]{40}$/);
    expect(first.addresses.btc).toMatch(/^bc1/);
    expect(first.addresses.xrp).toMatch(/^r/);
    expect(first.addresses.xlm).toMatch(/^G/);
  });

  it("uses separate domain labels for each chain", () => {
    const seedHex = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

    expect(deriveSecp256k1PrivateKey(seedHex, "eth")).not.toEqual(deriveSecp256k1PrivateKey(seedHex, "btc"));
    expect(deriveSecp256k1PrivateKey(seedHex, "eth")).not.toEqual(deriveSecp256k1PrivateKey(seedHex, "xrp"));
    expect(deriveEd25519Seed(seedHex, "xlm")).not.toEqual(deriveSecp256k1PrivateKey(seedHex, "eth"));
  });

  it("changes every displayed address when the root seed changes", () => {
    const first = deriveExplorerIdentity(stored("1111111111111111111111111111111111111111111111111111111111111111"));
    const second = deriveExplorerIdentity(stored("2222222222222222222222222222222222222222222222222222222222222222"));

    expect(first.addresses.eth).not.toBe(second.addresses.eth);
    expect(first.addresses.btc).not.toBe(second.addresses.btc);
    expect(first.addresses.xrp).not.toBe(second.addresses.xrp);
    expect(first.addresses.xlm).not.toBe(second.addresses.xlm);
  });
});
