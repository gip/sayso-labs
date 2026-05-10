import { describe, expect, it } from "vitest";
import { validateWorldIdWalletPresentation } from "./worldIdentity.js";

const verifierConfig = { rpId: "rp_test" };

const worldIdWalletPresentation = (overrides: Record<string, unknown> = {}) => ({
  type: "sayso.claim.world-id.wallet",
  payload: {
    wallet: {
      type: "ethereum",
      address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    },
    version: "world-id-4",
    proofType: "uniqueness",
    rpId: "rp_test",
    action: "human",
    idkitResponse: {},
    ...overrides,
  },
});

describe("World ID wallet presentation validation", () => {
  it("accepts the sayso.claim.world-id.wallet shape from the claim skill", () => {
    expect(validateWorldIdWalletPresentation(worldIdWalletPresentation(), verifierConfig)).toBeNull();
  });

  it("rejects malformed presentations", () => {
    expect(validateWorldIdWalletPresentation(worldIdWalletPresentation({ version: "world-id-3" }), verifierConfig)).toContain("world-id-4");
  });

  it("rejects a presentation for the wrong relying party", () => {
    expect(validateWorldIdWalletPresentation(worldIdWalletPresentation({ rpId: "rp_other" }), verifierConfig)).toContain("rp_test");
  });
});
