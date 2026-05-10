import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App.js";

const mockExploreSaySoAgent = vi.hoisted(() => vi.fn());

vi.mock("./xmtpExplorer.js", () => ({
  exploreSaySoAgent: mockExploreSaySoAgent,
}));

const renderAt = (initialEntries: string[]) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <App />
    </MemoryRouter>,
  );

const disclosedAgent = {
  registrationId: "reg_public",
  walletAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
  agent: {
    agentId: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd-agent-public",
    syncInboxId: "inbox_public",
    displayName: "Public Agent",
    protocolVersion: "0.1.0",
  },
  visibility: "public",
  description: "A public SaySo agent",
  skillDisclosure: "include-skill-packet",
  claimTypes: ["sayso.claim.world-id.wallet"],
  connectionCount: 3,
  updatedAt: new Date("2026-05-01T00:00:00Z").toISOString(),
  skillStatuses: [{
    name: "sayso.network@0.1.0",
    skillId: "sayso.network",
    version: "0.1.0",
    displayName: "SaySo Network",
    sha256: "0".repeat(64),
    status: "reference",
  }],
  skillPacket: {
    skills: [{
      skillId: "sayso.network",
      name: "SaySo Network",
      version: "0.1.0",
      kind: "service",
      imports: [{ skillId: "sayso.protocol", version: "^0.1.0", required: true }],
      skill: {
        capabilities: [{
          capabilityId: "sayso.network.register",
          title: "Register agent",
          description: "Register, update, or remove an agent from the SaySo Network registry.",
          requestContentTypes: ["sayso.network/registration-submit/1"],
          responseContentTypes: ["sayso.network/registration-result/1"],
          channels: ["sync"],
          paymentPolicy: "none",
        }],
        contentTypes: [{
          authorityId: "sayso.network",
          typeId: "registration-submit",
          versionMajor: 1,
          versionMinor: 0,
          purpose: "Register or update the sender's agent record.",
          channel: "sync",
        }],
        channels: [{
          channelId: "sync",
          kind: "sync",
          description: "Synchronous request/response protocol exchange.",
        }],
        paymentPolicies: [{
          policyId: "none",
          capabilityIds: ["sayso.network.register"],
          required: false,
          terms: {},
        }],
      },
      content: "---\nname: frontmatter-name\ndescription: Frontmatter metadata\n---\n\n# SaySo Network\n\nCanonical registry skill.",
      mediaType: "text/markdown",
    }],
    agent: {
      agentId: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd-agent-public",
      syncInboxId: "inbox_public",
      displayName: "Public Agent",
      kind: "agent",
      protocolVersion: "0.1.0",
    },
    skill: {
      capabilities: [],
      contentTypes: [],
      channels: [],
      paymentPolicies: [],
    },
    resolution: {
      mode: "all",
      includedSkillIds: ["sayso.network"],
      dependencyOrder: ["sayso.network"],
    },
    content: "",
    mediaType: "application/json",
  },
};

const productionAgent = {
  ...disclosedAgent,
  registrationId: "reg_production",
  walletAddress: "0x2222222222222222222222222222222222222222",
  agent: {
    ...disclosedAgent.agent,
    agentId: "production_public",
    syncInboxId: "production_inbox_public",
    displayName: "Production Agent",
  },
};

const explorerResult = {
  status: "sayso",
  env: "dev",
  clientAddress: "0x1111111111111111111111111111111111111111",
  clientInboxId: "client_inbox",
  targetAddress: "0xc9f639a95813c834967fb8a38f749ea5f0b5cdd9",
  package: {
    kind: "agent-info",
    contentType: "sayso.protocol/agent-info/1",
    protocolVersion: "0.1.0",
    supportedProtocolVersions: ["0.1.0"],
    fallbackText: "This agent speaks SaySo.",
    agent: {
      agentId: "explored_agent",
      syncInboxId: "explored_inbox",
      displayName: "Explored Agent",
    },
    skillPacket: {
      agent: {
        agentId: "explored_agent",
        syncInboxId: "explored_inbox",
        displayName: "Explored Agent",
        kind: "agent",
        protocolVersion: "0.1.0",
      },
      skill: {
        capabilities: [{
          capabilityId: "sayso.demo.inspect",
          title: "Inspect",
          description: "Inspect agent capabilities.",
          requestContentTypes: ["sayso.protocol/skill-request/1"],
          responseContentTypes: ["sayso.protocol/skill-response/1"],
          channels: ["xmtp.dm"],
          paymentPolicy: "none",
        }],
        contentTypes: [{
          authorityId: "sayso.protocol",
          typeId: "skill-request",
          versionMajor: 1,
          purpose: "request skills",
        }],
        channels: [{
          channelId: "xmtp.dm",
          kind: "dm",
          description: "XMTP direct message",
        }],
        paymentPolicies: [{
          policyId: "none",
          capabilityIds: ["sayso.demo.inspect"],
          required: false,
          terms: {},
        }],
      },
      skills: [{
        skillId: "sayso.demo.inspect",
        name: "Inspect",
        version: "0.1.0",
        kind: "service",
        imports: [],
        skill: {
          capabilities: [],
          contentTypes: [],
          channels: [],
          paymentPolicies: [],
        },
        content: "# Inspect\n\nExplorer skill.",
        mediaType: "text/markdown",
      }],
      resolution: {
        mode: "all",
        includedSkillIds: ["sayso.demo.inspect"],
        dependencyOrder: ["sayso.demo.inspect"],
      },
      content: "",
      mediaType: "application/json",
    },
  },
} as const;

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockExploreSaySoAgent.mockReset();
    mockExploreSaySoAgent.mockResolvedValue(explorerResult);
    vi.stubGlobal("crypto", {
      getRandomValues: (array: Uint8Array) => {
        array.fill(7);
        return array;
      },
      randomUUID: () => "00000000-0000-4000-8000-000000000007",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const target = String(url);
        const isProduction = target.includes("env=production");
        if (target.startsWith("/api/stats")) {
          return Response.json(isProduction
            ? { total: 20, public: 10, private: 10, disclosedSkillPacket: 4 }
            : { total: 2, public: 1, private: 1, disclosedSkillPacket: 1 });
        }
        if (target.startsWith("/api/agents?")) {
          return Response.json({ results: [isProduction ? productionAgent : disclosedAgent] });
        }
        if (target.startsWith("/api/agents/0xabcdefabcdefabcdefabcdefabcdefabcdefabcd-agent-public?")) {
          return Response.json(disclosedAgent);
        }
        if (target.startsWith("/api/agents/production_public?")) return Response.json(productionAgent);
        return new Response("not found", { status: 404 });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("redirects root to /registry and loads public agents", async () => {
    renderAt(["/"]);

    expect((await screen.findAllByText("Public Agent")).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Registry" })).toHaveClass("active");
    expect(screen.getByText("Total")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("sayso.network@0.1.0")).toBeInTheDocument());
    expect(screen.getByText("Reference")).toBeInTheDocument();
    expect(screen.getAllByText("Short name").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Global ID").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd-agent-public").length).toBeGreaterThan(0);
    expect(screen.getByText("sayso.claim.world-id.wallet")).toBeInTheDocument();
    expect(screen.getByText("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd")).toBeInTheDocument();
    expect(screen.getByText("Connections")).toBeInTheDocument();
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
    expect(screen.queryByText("Search agents")).not.toBeInTheDocument();
  });

  it("opens the skill reader as a route and shows the structured contract on demand", async () => {
    renderAt(["/registry"]);

    expect((await screen.findAllByText("Public Agent")).length).toBeGreaterThan(0);
    expect(await screen.findByText("Frontmatter metadata")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: /SaySo Networksayso\.network@/ }));

    expect(await screen.findByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    expect(screen.getAllByText("Reference").length).toBeGreaterThan(0);
    expect(screen.getByText("Skill content")).toBeInTheDocument();
    expect(screen.getByText(/Canonical registry skill/)).toBeInTheDocument();
    expect(screen.queryByText("Register agent")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Structured contract"));

    expect(screen.getByText("Register agent")).toBeInTheDocument();
    expect(screen.getAllByText("sayso.network/registration-submit/1").length).toBeGreaterThan(0);
    expect(screen.queryByText("frontmatter-name")).not.toBeInTheDocument();
  });

  it("switches registry environments via the env pill", async () => {
    renderAt(["/registry"]);

    expect((await screen.findAllByText("Public Agent")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Prod" }));

    expect((await screen.findAllByText("Production Agent")).length).toBeGreaterThan(0);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/stats?env=production"));
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/agents\?env=production/));
    expect(fetch).toHaveBeenCalledWith("/api/agents/production_public?env=production");
    expect(screen.getByRole("button", { name: "Prod" })).toHaveAttribute("aria-pressed", "true");
  });

  it("loads /spec for the markdown overview", () => {
    renderAt(["/spec"]);

    expect(screen.getByText(/SaySo is a meta protocol for agents and humans/)).toBeInTheDocument();
    expect(screen.getAllByText(/\/sayso-protocol\/SKILL\.md/).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Spec" })).toHaveClass("active");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows an empty state", async () => {
    vi.mocked(fetch).mockImplementation(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.startsWith("/api/stats")) return Response.json({ total: 0, public: 0, private: 0, disclosedSkillPacket: 0 });
      if (target.startsWith("/api/agents?")) return Response.json({ results: [] });
      return new Response("not found", { status: 404 });
    });

    renderAt(["/registry"]);

    expect(await screen.findByText("No public agents match the current filters.")).toBeInTheDocument();
  });

  it("renders agents when claimTypes is omitted", async () => {
    const agentWithoutClaimTypes = { ...disclosedAgent };
    delete (agentWithoutClaimTypes as Partial<typeof disclosedAgent>).claimTypes;
    vi.mocked(fetch).mockImplementation(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.startsWith("/api/stats")) return Response.json({ total: 1, public: 1, private: 0, disclosedSkillPacket: 1 });
      if (target.startsWith("/api/agents?")) return Response.json({ results: [agentWithoutClaimTypes] });
      if (target.startsWith("/api/agents/0xabcdefabcdefabcdefabcdefabcdefabcdefabcd-agent-public?")) return Response.json(agentWithoutClaimTypes);
      return new Response("not found", { status: 404 });
    });

    renderAt(["/registry"]);

    expect((await screen.findAllByText("Public Agent")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Claim types")).not.toBeInTheDocument();
  });

  it("renders the explorer, persists generated seed identities, and restores them", async () => {
    const { unmount } = renderAt(["/"]);

    fireEvent.click(screen.getByRole("link", { name: "Explorer" }));

    expect(screen.getByRole("button", { name: "Dev" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Create address" }));

    expect(await screen.findByText("ETH")).toBeInTheDocument();
    expect(screen.getByText("BTC")).toBeInTheDocument();
    expect(screen.getByText("XRP")).toBeInTheDocument();
    expect(screen.getByText("XLM")).toBeInTheDocument();
    const stored = JSON.parse(window.localStorage.getItem("sayso:network-explorer:v1") ?? "[]") as Array<{ seedHex: string }>;
    expect(stored).toHaveLength(1);
    expect(stored[0].seedHex).toMatch(/^(07){32}$/);

    unmount();
    cleanup();
    renderAt(["/explorer"]);

    expect(screen.getByRole("link", { name: "Explorer" })).toHaveClass("active");
    expect(await screen.findByText("ETH")).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("sayso:network-explorer:v1") ?? "[]")).toHaveLength(1);
  });

  it("explores an agent and renders the first SaySo package details", async () => {
    window.localStorage.setItem(
      "sayso:network-explorer:v1",
      JSON.stringify([{
        id: "stored",
        seedHex: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        createdAt: "2026-05-03T00:00:00.000Z",
      }]),
    );

    renderAt(["/explorer?env=production"]);

    fireEvent.change(screen.getByLabelText("XMTP agent ETH address"), {
      target: { value: "0xc9F639A95813C834967FB8a38f749eA5F0b5CdD9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Explore" }));

    expect(await screen.findByText("Explored Agent")).toBeInTheDocument();
    expect(screen.getByText("sayso.protocol/agent-info/1")).toBeInTheDocument();
    expect(screen.getByText("sayso.demo.inspect@0.1.0")).toBeInTheDocument();
    expect(screen.getByText("xmtp.dm")).toBeInTheDocument();
    const skillsHeading = screen.getByRole("heading", { name: "Skills" });
    const capabilitiesHeading = screen.getByRole("heading", { name: "Capabilities" });
    expect(Boolean(skillsHeading.compareDocumentPosition(capabilitiesHeading) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(screen.queryByText("Inspect agent capabilities.")).not.toBeInTheDocument();
    const capabilityButton = screen.getByRole("button", { name: "Show capabilities" });
    expect(capabilityButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(capabilityButton);
    expect(screen.getByText("Inspect agent capabilities.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide capabilities" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("client_inbox")).toBeInTheDocument();
    expect(mockExploreSaySoAgent).toHaveBeenCalledWith(expect.objectContaining({
      env: "production",
      targetAddress: "0xc9F639A95813C834967FB8a38f749eA5F0b5CdD9",
    }));
  });
});
