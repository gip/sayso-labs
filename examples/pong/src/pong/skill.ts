import type { AgentSkillContract, SkillPacket, SaySoSkillDocument } from "../sayso/types.js";
import { SAYSO_PROTOCOL_VERSION } from "../sayso/constants.js";
import { readSkillMarkdown } from "../sayso/markdown.js";

export const PONG_SKILL_ID = "sayso.demo.pong";
export const PONG_SKILL_VERSION = "0.1.0";
export const SAYSO_RUNTIME_SKILL_ID = "sayso.runtime";
export const SAYSO_RUNTIME_VERSION = "0.1.0";
export const PONG_RUNTIME_ENTRYPOINT = "examples/pong/src/pong/runtime-app.js";
export const PONG_RUNTIME_BYTECODE = "examples/pong/src/pong/runtime-app.qjsc";

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

const PONG_RUNTIME_METADATA = {
  abiVersion: SAYSO_RUNTIME_VERSION,
  applications: [
    {
      appId: PONG_SKILL_ID,
      callbacks: [
        "skillPacket",
        "handleConnectionRequest",
        "handleSkillRequest",
        "handleMessage",
        "disconnect",
        "forgetMe",
      ],
      hostOperations: ["params.get", "clock.nowIso", "pong.sourceManifest", "pong.sourceChunk"],
      localOperations: ["pong.sourceManifest", "pong.sourceChunk"],
      source: {
        skillId: "sayso.source",
        format: "files",
        entrypoint: PONG_RUNTIME_ENTRYPOINT,
        include: [PONG_RUNTIME_ENTRYPOINT, PONG_RUNTIME_BYTECODE],
      },
      network: {
        https: [],
        wss: [],
      },
    },
  ],
};

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
  content: readSkillMarkdown("skills/sayso-configure/SKILL.md"),
  mediaType: "text/markdown",
});

export const sourceSkillDocument = (): SaySoSkillDocument => ({
  skillId: "sayso.source",
  name: "SaySo Source",
  version: "0.1.0",
  kind: "extension",
  imports: [
    {
      skillId: "sayso.protocol",
      version: "^0.1.0",
      required: true,
    },
    {
      skillId: "sayso.configure",
      version: "^0.1.0",
      required: true,
    },
  ],
  skill: {
    capabilities: [
      {
        capabilityId: "sayso.source.snapshot",
        title: "Source snapshot",
        description: "Return a read-only source snapshot manifest and chunked file bytes.",
        requestContentTypes: ["sayso.source/source-manifest-request/1", "sayso.source/source-chunk-request/1"],
        responseContentTypes: ["sayso.source/source-manifest-response/1", "sayso.source/source-chunk-response/1"],
        channels: ["sync"],
        paymentPolicy: "none",
      },
    ],
    contentTypes: [
      {
        authorityId: "sayso.source",
        typeId: "source-manifest-request",
        versionMajor: 1,
        versionMinor: 0,
        purpose: "Request a source snapshot manifest.",
        channel: "sync",
      },
      {
        authorityId: "sayso.source",
        typeId: "source-manifest-response",
        versionMajor: 1,
        versionMinor: 0,
        purpose: "Return snapshot metadata, file entries, and chunk metadata.",
        channel: "sync",
      },
      {
        authorityId: "sayso.source",
        typeId: "source-chunk-request",
        versionMajor: 1,
        versionMinor: 0,
        purpose: "Request one file chunk from a snapshot.",
        channel: "sync",
      },
      {
        authorityId: "sayso.source",
        typeId: "source-chunk-response",
        versionMajor: 1,
        versionMinor: 0,
        purpose: "Return one base64-encoded chunk or an error.",
        channel: "sync",
      },
    ],
    channels: [],
    paymentPolicies: [],
  },
  content: readSkillMarkdown("skills/sayso-source/SKILL.md"),
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
  content: readSkillMarkdown("skills/sayso-runtime/SKILL.md"),
  mediaType: "text/markdown",
});

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
  content: readSkillMarkdown("skills/sayso-protocol/SKILL.md"),
  mediaType: "text/markdown",
});

export const pongSkillDocument = (): SaySoSkillDocument => ({
  skillId: PONG_SKILL_ID,
  name: "SaySo Demo Pong",
  version: PONG_SKILL_VERSION,
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
        capabilityId: "pong.respond",
        title: "Pong response",
        description: "Respond to a ping request with a pong response.",
        requestContentTypes: ["sayso.demo.pong/ping-request/1"],
        responseContentTypes: ["sayso.demo.pong/pong-response/1"],
        channels: ["sync"],
        paymentPolicy: "none",
        inputSchema: {
          type: "object",
          required: ["requestId"],
          properties: {
            requestId: { type: "string" },
            message: { type: "string" },
            sentAt: { type: "string", format: "date-time" },
          },
        },
        outputSchema: {
          type: "object",
          required: ["requestId", "message", "receivedAt", "respondedAt"],
          properties: {
            requestId: { type: "string" },
            message: { const: "pong" },
            receivedMessage: { type: "string" },
            receivedAt: { type: "string", format: "date-time" },
            respondedAt: { type: "string", format: "date-time" },
          },
        },
      },
    ],
    contentTypes: [
      {
        authorityId: "sayso.demo.pong",
        typeId: "ping-request",
        versionMajor: 1,
        versionMinor: 0,
        purpose: "Ask the pong agent to respond.",
        channel: "sync",
      },
      {
        authorityId: "sayso.demo.pong",
        typeId: "pong-response",
        versionMajor: 1,
        versionMinor: 0,
        purpose: "Return the pong response.",
        channel: "sync",
      },
    ],
    channels: [],
    paymentPolicies: [],
  },
  content: readSkillMarkdown("examples/skills/pong/SKILL.md"),
  mediaType: "text/markdown",
});

export const createPongResolvedSkill = (syncInboxId: string): AgentSkillContract => {
  const protocol = protocolSkillDocument().skill;
  const runtime = runtimeSkillDocument().skill;
  const configure = configureSkillDocument().skill;
  const source = sourceSkillDocument().skill;
  const pong = pongSkillDocument().skill;
  return {
    capabilities: [
      ...protocol.capabilities,
      ...runtime.capabilities,
      ...configure.capabilities,
      ...source.capabilities,
      ...pong.capabilities,
    ],
    contentTypes: [
      ...protocol.contentTypes,
      ...runtime.contentTypes,
      ...configure.contentTypes,
      ...source.contentTypes,
      ...pong.contentTypes,
    ],
    channels: [
      {
        channelId: "sync",
        kind: "sync",
        description: "Public XMTP sync inbox for SaySo connection, discovery, disconnect, configuration, source snapshots, and pong.",
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
          "sayso.source/source-manifest-request/1",
          "sayso.source/source-manifest-response/1",
          "sayso.source/source-chunk-request/1",
          "sayso.source/source-chunk-response/1",
          "sayso.demo.pong/ping-request/1",
          "sayso.demo.pong/pong-response/1",
        ],
      },
    ],
    paymentPolicies: [],
    runtime: PONG_RUNTIME_METADATA,
  };
};

export const pongSkillDocuments = () => [
  protocolSkillDocument(),
  runtimeSkillDocument(),
  configureSkillDocument(),
  sourceSkillDocument(),
  pongSkillDocument(),
];

export const createPongSkillPacket = (input: {
  agentId: string;
  syncInboxId: string;
  displayName: string;
}): SkillPacket => {
  const skills = pongSkillDocuments();
  return {
    agent: {
      ...input,
      kind: "service",
      protocolVersion: SAYSO_PROTOCOL_VERSION,
    },
    skill: createPongResolvedSkill(input.syncInboxId),
    skills,
    resolution: {
      mode: "all",
      includedSkillIds: skills.map((skill) => skill.skillId),
      dependencyOrder: skills.map((skill) => skill.skillId),
    },
    content: readSkillMarkdown("examples/skills/pong/SKILL.md"),
    mediaType: "text/markdown",
  };
};

export const hasPongSkill = (skillResponse: {
  skills?: Array<{ skillId: string }>;
  skill?: { capabilities?: Array<{ capabilityId: string }> };
}) =>
  Boolean(
    skillResponse.skills?.some((skill) => skill.skillId === PONG_SKILL_ID) ||
      skillResponse.skill?.capabilities?.some((capability) => capability.capabilityId === "pong.respond"),
  );
