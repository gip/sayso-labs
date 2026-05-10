import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentSkillContract, SkillPacket, SaySoSkillDocument } from "../sayso/types.js";
import { SAYSO_PROTOCOL_VERSION } from "../sayso/constants.js";

export const ORACLE_SKILL_ID = "sayso.finance.oracle";
export const ORACLE_SKILL_VERSION = "0.1.0";
export const ORACLE_AGENT_NAME = "sayso-oracle";
export const ORACLE_DISPLAY_NAME = "SaySo Oracle";
export const SAYSO_RUNTIME_SKILL_ID = "sayso.runtime";
export const SAYSO_RUNTIME_VERSION = "0.1.0";

const SAYSO_RUNTIME_HOST_OPERATIONS = [
  "params.get",
  "clock.nowIso",
  "id.generate",
  "signer.getAccount",
  "signer.signMessage",
  "local.text.write",
  "local.text.read",
  "network.https.request",
  "network.wss.open",
] as const;

const ORACLE_RUNTIME_METADATA = {
  abiVersion: SAYSO_RUNTIME_VERSION,
  applications: [
    {
      appId: ORACLE_SKILL_ID,
      callbacks: [
        "skillPacket",
        "handleConnectionRequest",
        "handleSkillRequest",
        "handleMessage",
        "disconnect",
        "forgetMe",
      ],
      hostOperations: ["params.get", "clock.nowIso"],
      network: {
        https: [],
        wss: [],
      },
    },
  ],
};

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(moduleDir, "../..");

const readTextFile = (filePath: string) => readFileSync(filePath, "utf8");

const findSaySoRepoRoot = () => {
  const candidates = [
    process.env.SAYSO_REPO_DIR,
    path.resolve(packageRoot, "../.."),
    path.resolve(process.cwd(), "sayso"),
    path.resolve(process.cwd(), "../sayso"),
    path.resolve(process.cwd(), "../../sayso"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const root = candidates.find((candidate) =>
    existsSync(path.join(candidate, "skills/sayso-protocol/SKILL.md")) &&
    existsSync(path.join(candidate, "skills/sayso-configure/SKILL.md")),
  );
  if (!root) {
    throw new Error("Unable to locate SaySo Labs repo. Set SAYSO_REPO_DIR or run sayso-oracle from sayso-labs.");
  }
  return root;
};

const readSaySoSkillMarkdown = (relativePath: string) =>
  readTextFile(path.join(findSaySoRepoRoot(), relativePath));

const readOracleSkillMarkdown = () =>
  readTextFile(path.join(packageRoot, "skills/sayso-oracle/SKILL.md"));

export const oracleAgentId = (walletAddress: string) =>
  `${walletAddress.toLowerCase()}-${ORACLE_AGENT_NAME}`;

export const protocolSkillDocument = (): SaySoSkillDocument => ({
  skillId: "sayso.protocol",
  name: "SaySo Protocol",
  version: SAYSO_PROTOCOL_VERSION,
  kind: "meta",
  imports: [],
  skill: {
    capabilities: [
      {
        capabilityId: "sayso.connection",
        title: "SaySo connection",
        description: "Read agent info, connect, and refresh current skills.",
        requestContentTypes: ["sayso.protocol/connection-request/1"],
        responseContentTypes: ["sayso.protocol/agent-info/1", "sayso.protocol/connection-response/1"],
        channels: ["sync"],
        paymentPolicy: "none",
      },
      {
        capabilityId: "sayso.discovery",
        title: "Skill discovery",
        description: "Return the structured and human-readable skill contract for this agent.",
        requestContentTypes: ["sayso.protocol/skill-request/1"],
        responseContentTypes: ["sayso.protocol/skill-response/1"],
        channels: ["sync"],
        paymentPolicy: "none",
      },
      {
        capabilityId: "sayso.disconnect",
        title: "Disconnect",
        description: "Disconnect from the agent or request data deletion.",
        requestContentTypes: ["sayso.protocol/disconnect/1", "sayso.protocol/forget-me/1"],
        responseContentTypes: ["sayso.protocol/disconnect-ack/1"],
        channels: ["sync"],
        paymentPolicy: "none",
      },
    ],
    contentTypes: [
      {
        authorityId: "sayso.protocol",
        typeId: "agent-info",
        versionMajor: 1,
        versionMinor: 0,
        purpose: "Send agent identity, fallback text, and full current skill packet on connection.",
        channel: "sync",
      },
      {
        authorityId: "sayso.protocol",
        typeId: "connection-request",
        versionMajor: 1,
        versionMinor: 0,
        purpose: "Request SaySo connection with an empty JSON payload or optional claim presentations.",
        channel: "sync",
      },
      {
        authorityId: "sayso.protocol",
        typeId: "connection-response",
        versionMajor: 1,
        versionMinor: 0,
        purpose: "Return SaySo protocol version, verified claims, and next step.",
        channel: "sync",
      },
      {
        authorityId: "sayso.protocol",
        typeId: "skill-request",
        versionMajor: 1,
        versionMinor: 0,
        purpose: "Request the agent skill contract.",
        channel: "sync",
      },
      {
        authorityId: "sayso.protocol",
        typeId: "skill-response",
        versionMajor: 1,
        versionMinor: 0,
        purpose: "Return the agent skill contract.",
        channel: "sync",
      },
      {
        authorityId: "sayso.protocol",
        typeId: "disconnect",
        versionMajor: 1,
        versionMinor: 0,
        purpose: "Close the current conversation context.",
        channel: "sync",
      },
      {
        authorityId: "sayso.protocol",
        typeId: "forget-me",
        versionMajor: 1,
        versionMinor: 0,
        purpose: "Close the relationship and request data deletion.",
        channel: "sync",
      },
      {
        authorityId: "sayso.protocol",
        typeId: "disconnect-ack",
        versionMajor: 1,
        versionMinor: 0,
        purpose: "Report disconnect or deletion handling.",
        channel: "sync",
      },
      {
        authorityId: "sayso.protocol",
        typeId: "error",
        versionMajor: 1,
        versionMinor: 0,
        purpose: "Report a core protocol error.",
        channel: "sync",
      },
    ],
    channels: [],
    paymentPolicies: [],
  },
  content: readSaySoSkillMarkdown("skills/sayso-protocol/SKILL.md"),
  mediaType: "text/markdown",
});

export const configureSkillDocument = (): SaySoSkillDocument => ({
  skillId: "sayso.configure",
  name: "SaySo Configure",
  version: "0.1.0",
  kind: "extension",
  imports: [
    {
      skillId: "sayso.protocol",
      version: "^0.1.0",
      required: true,
    },
  ],
  skill: {
    capabilities: [
      {
        capabilityId: "sayso.configure.read",
        title: "Configuration discovery",
        description: "Return public configuration values and private configuration variable metadata.",
        requestContentTypes: ["sayso.configure/configuration-request/1"],
        responseContentTypes: ["sayso.configure/configuration-response/1"],
        channels: ["sync"],
        paymentPolicy: "none",
      },
    ],
    contentTypes: [
      {
        authorityId: "sayso.configure",
        typeId: "configuration-request",
        versionMajor: 1,
        versionMinor: 0,
        purpose: "Request visible configuration variable metadata.",
        channel: "sync",
      },
      {
        authorityId: "sayso.configure",
        typeId: "configuration-response",
        versionMajor: 1,
        versionMinor: 0,
        purpose: "Return public values and private variable metadata.",
        channel: "sync",
      },
    ],
    channels: [],
    paymentPolicies: [],
  },
  content: readSaySoSkillMarkdown("skills/sayso-configure/SKILL.md"),
  mediaType: "text/markdown",
});

export const runtimeSkillDocument = (): SaySoSkillDocument => ({
  skillId: SAYSO_RUNTIME_SKILL_ID,
  name: "SaySo Runtime",
  version: SAYSO_RUNTIME_VERSION,
  kind: "extension",
  imports: [
    {
      skillId: "sayso.protocol",
      version: "^0.1.0",
      required: true,
    },
  ],
  skill: {
    capabilities: [
      {
        capabilityId: "sayso.runtime.application",
        title: "Portable runtime application",
        description: "Run application business callbacks behind the SaySo runtime host ABI.",
        requestContentTypes: [],
        responseContentTypes: [],
        channels: [],
        paymentPolicy: "none",
        runtimeAbi: {
          abiVersion: SAYSO_RUNTIME_VERSION,
          hostOperations: [...SAYSO_RUNTIME_HOST_OPERATIONS],
        },
      },
    ],
    contentTypes: [],
    channels: [],
    paymentPolicies: [],
    runtime: {
      abiVersion: SAYSO_RUNTIME_VERSION,
      hostOperations: [...SAYSO_RUNTIME_HOST_OPERATIONS],
    },
  },
  content: readSaySoSkillMarkdown("skills/sayso-runtime/SKILL.md"),
  mediaType: "text/markdown",
});

export const oracleSkillDocument = (): SaySoSkillDocument => ({
  skillId: ORACLE_SKILL_ID,
  name: "SaySo Finance Oracle",
  version: ORACLE_SKILL_VERSION,
  kind: "service",
  imports: [
    {
      skillId: "sayso.protocol",
      version: "^0.1.0",
      required: true,
    },
  ],
  skill: {
    capabilities: [
      {
        capabilityId: "oracle.spot-price",
        title: "Spot price",
        description: "Return Coinbase spot ticker prices for configured markets.",
        requestContentTypes: ["sayso.finance.oracle/spot-price-request/1"],
        responseContentTypes: ["sayso.finance.oracle/spot-price-response/1"],
        channels: ["sync"],
        paymentPolicy: "none",
        inputSchema: {
          type: "object",
          required: ["requestId", "markets"],
          properties: {
            requestId: { type: "string" },
            markets: { type: "array", items: { type: "string" } },
          },
        },
        outputSchema: {
          type: "object",
          required: ["requestId", "status", "generatedAt", "results"],
          properties: {
            requestId: { type: "string" },
            status: { const: "ok" },
            generatedAt: { type: "string", format: "date-time" },
            results: { type: "array" },
          },
        },
      },
    ],
    contentTypes: [
      {
        authorityId: "sayso.finance.oracle",
        typeId: "spot-price-request",
        versionMajor: 1,
        versionMinor: 0,
        purpose: "Request spot ticker prices for one or more markets.",
        channel: "sync",
      },
      {
        authorityId: "sayso.finance.oracle",
        typeId: "spot-price-response",
        versionMajor: 1,
        versionMinor: 0,
        purpose: "Return per-market spot ticker prices or per-market errors.",
        channel: "sync",
      },
    ],
    channels: [],
    paymentPolicies: [],
  },
  content: readOracleSkillMarkdown(),
  mediaType: "text/markdown",
});

export const createOracleResolvedSkill = (syncInboxId: string): AgentSkillContract => {
  const protocol = protocolSkillDocument().skill;
  const runtime = runtimeSkillDocument().skill;
  const configure = configureSkillDocument().skill;
  const oracle = oracleSkillDocument().skill;
  return {
    capabilities: [
      ...protocol.capabilities,
      ...runtime.capabilities,
      ...configure.capabilities,
      ...oracle.capabilities,
    ],
    contentTypes: [
      ...protocol.contentTypes,
      ...runtime.contentTypes,
      ...configure.contentTypes,
      ...oracle.contentTypes,
    ],
    channels: [
      {
        channelId: "sync",
        kind: "sync",
        description: "Public XMTP sync inbox for SaySo connection, discovery, disconnect, configuration, and spot price requests.",
        inboxId: syncInboxId,
        contentTypes: [
          "sayso.protocol/agent-info/1",
          "sayso.protocol/connection-request/1",
          "sayso.protocol/connection-response/1",
          "sayso.protocol/skill-request/1",
          "sayso.protocol/skill-response/1",
          "sayso.protocol/disconnect/1",
          "sayso.protocol/forget-me/1",
          "sayso.protocol/disconnect-ack/1",
          "sayso.protocol/error/1",
          "sayso.configure/configuration-request/1",
          "sayso.configure/configuration-response/1",
          "sayso.finance.oracle/spot-price-request/1",
          "sayso.finance.oracle/spot-price-response/1",
        ],
      },
    ],
    paymentPolicies: [],
    runtime: ORACLE_RUNTIME_METADATA,
  };
};

export const oracleSkillDocuments = () => [
  protocolSkillDocument(),
  runtimeSkillDocument(),
  configureSkillDocument(),
  oracleSkillDocument(),
];

export const createOracleSkillPacket = (input: {
  agentId: string;
  syncInboxId: string;
  displayName: string;
}): SkillPacket => {
  const skills = oracleSkillDocuments();
  return {
    agent: {
      ...input,
      kind: "service",
      protocolVersion: SAYSO_PROTOCOL_VERSION,
    },
    skill: createOracleResolvedSkill(input.syncInboxId),
    skills,
    resolution: {
      mode: "all",
      includedSkillIds: skills.map((skill) => skill.skillId),
      dependencyOrder: skills.map((skill) => skill.skillId),
    },
    content: readOracleSkillMarkdown(),
    mediaType: "text/markdown",
  };
};
