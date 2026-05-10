import { describe, expect, it } from "vitest";
import { shouldServeRootMarkdown } from "./rootNegotiation.js";

describe("root markdown negotiation", () => {
  it("serves markdown for curl-like accept headers", () => {
    expect(shouldServeRootMarkdown("*/*")).toBe(true);
    expect(shouldServeRootMarkdown(undefined)).toBe(true);
  });

  it("keeps the HTML shell for browser accept headers", () => {
    expect(shouldServeRootMarkdown("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")).toBe(false);
    expect(shouldServeRootMarkdown(["application/json", "text/html"])).toBe(false);
  });
});
