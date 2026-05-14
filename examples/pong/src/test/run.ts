import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { contentTypesAreEqual } from "@xmtp/content-type-primitives";
import { CONTENT_TYPES, contentTypeNameFromKey } from "../sayso/contentTypes.js";
import { saysoCodecs } from "../sayso/codecs.js";
import { createAgentInfo, createConnectionResponse, createSkillResponse } from "../sayso/protocol.js";
import { walletAddressFromInboxState } from "../sayso/identity.js";
import {
  isConnectionRequest,
  parseConfigurationRequest,
  parseForkOffersRequest,
  parseForkRequest,
  parseSourceChunkRequest,
  parseSourceManifestRequest,
  parseSkillRequest,
} from "../sayso/validation.js";
import { createPongConfigurationResponse } from "../pong/configuration.js";
import { createPongResponse, isPingRequest } from "../pong/handler.js";
import { createQuickJsPongApplication, PONG_RUNTIME_APP_FILENAME, readPongRuntimeAppSource } from "../pong/quickjs.js";
import {
  createPongSourceChunkResponse,
  createPongSourceManifestResponse,
  PONG_SOURCE_SNAPSHOT_TTL_MS,
  type PongSourceSnapshotStore,
} from "../pong/source.js";
import { PONG_RUNTIME_BYTECODE_METADATA } from "../pong/runtimeBytecode.js";
import {
  createPongResolvedSkill,
  createPongSkillPacket,
  hasPongSkill,
  PONG_RUNTIME_BYTECODE,
  PONG_RUNTIME_ENTRYPOINT,
  pongSkillDocuments,
} from "../pong/skill.js";
import { createPongNetworkRegistration, pongAgentId } from "../pong/networkRegistration.js";
import { createQuickJsApplication, type JsonValue } from "../sayso/quickjs.js";
import type { ConfigurationResponsePayload, ForkResultPayload, SourceChunkResponsePayload } from "../sayso/types.js";

assert.equal(contentTypeNameFromKey("agentInfo"), "sayso.protocol/agent-info/1");
assert.equal(contentTypeNameFromKey("connectionRequest"), "sayso.protocol/connection-request/1");
assert.equal(contentTypeNameFromKey("registrationSubmit"), "sayso.network/registration-submit/1");
assert.equal(contentTypeNameFromKey("premiumRegistrationSubmit"), "sayso.network/premium-registration-submit/1");
assert.equal(contentTypeNameFromKey("registrationResult"), "sayso.network/registration-result/1");
assert.equal(contentTypeNameFromKey("paymentSubmit"), "sayso.payment/payment-submit/1");
assert.equal(contentTypeNameFromKey("configurationRequest"), "sayso.configure/configuration-request/1");
assert.equal(contentTypeNameFromKey("sourceManifestRequest"), "sayso.source/source-manifest-request/1");
assert.equal(contentTypeNameFromKey("forkRequest"), "sayso.fork/fork-request/1");
assert.equal(CONTENT_TYPES.pingRequest.authorityId, "sayso.demo.pong");

assert.equal(isConnectionRequest({}), true);
assert.equal(isConnectionRequest({ presentations: [{ type: "sayso.example", payload: { proof: "demo" } }] }), true);
assert.equal(isConnectionRequest({ unexpected: true }), false);
assert.equal(isConnectionRequest({ identities: [{ type: "sayso.example", payload: { proof: "demo" } }] }), false);
assert.equal(isConnectionRequest({ presentations: [{ type: "sayso.example" }] }), false);

assert.deepEqual(parseSkillRequest({ include: "all", skillIds: ["sayso.demo.pong"], maxDepth: 2 }), {
  include: "all",
  skillIds: ["sayso.demo.pong"],
  maxDepth: 2,
});
assert.equal(parseSkillRequest({ include: "everything" }), null);
assert.deepEqual(parseConfigurationRequest({ requestId: "config_req", names: ["PUBLIC_BASE_URL"] }), {
  requestId: "config_req",
  names: ["PUBLIC_BASE_URL"],
});
assert.equal(parseConfigurationRequest({ requestId: "config_req", includeValues: "private" }), null);
assert.deepEqual(parseSourceManifestRequest({ requestId: "source_manifest", format: "tar.gz" }), {
  requestId: "source_manifest",
  format: "tar.gz",
});
assert.deepEqual(
  parseSourceChunkRequest({
    requestId: "source_chunk",
    snapshotId: "snapshot_1",
    target: { kind: "file", path: "src/agent.ts" },
    chunkIndex: 0,
  }),
  {
    requestId: "source_chunk",
    snapshotId: "snapshot_1",
    target: { kind: "file", path: "src/agent.ts" },
    chunkIndex: 0,
  },
);
assert.equal(
  parseSourceChunkRequest({
    requestId: "source_chunk",
    snapshotId: "snapshot_1",
    target: { kind: "file", path: "../secret.env" },
    chunkIndex: 0,
  }),
  null,
);
assert.deepEqual(parseForkOffersRequest({ requestId: "fork_offers", requestedDurationSeconds: 3600 }), {
  requestId: "fork_offers",
  requestedDurationSeconds: 3600,
});
assert.deepEqual(
  parseForkRequest({
    requestId: "fork_req",
    offerId: "fork-free-1h",
    configuration: [{ name: "OPENAI_API_KEY", value: "sk-fork-only" }],
  }),
  {
    requestId: "fork_req",
    offerId: "fork-free-1h",
    configuration: [{ name: "OPENAI_API_KEY", value: "sk-fork-only" }],
  },
);

assert.equal(
  walletAddressFromInboxState({
    identifiers: [
      { identifier: "passkey-id", identifierKind: 1 },
      { identifier: "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD", identifierKind: 0 },
    ],
    recoveryIdentifier: { identifier: "0x1111111111111111111111111111111111111111", identifierKind: 0 },
  }),
  "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
);
assert.equal(
  walletAddressFromInboxState({
    identifiers: [{ identifier: "passkey-id", identifierKind: 1 }],
    recoveryIdentifier: { identifier: "0x2222222222222222222222222222222222222222", identifierKind: 0 },
  }),
  "0x2222222222222222222222222222222222222222",
);
assert.equal(
  walletAddressFromInboxState({
    identifiers: [{ identifier: "passkey-id", identifierKind: 1 }],
    recoveryIdentifier: { identifier: "recovery-passkey", identifierKind: 1 },
  }),
  undefined,
);

const connection = createConnectionResponse({
  agentId: "sayso-demo-pong",
  syncInboxId: "inbox",
  displayName: "SaySo Demo Pong",
  skillPacket: createPongSkillPacket({
    agentId: "sayso-demo-pong",
    syncInboxId: "inbox",
    displayName: "SaySo Demo Pong",
  }),
});
assert.equal(connection.status, "ok");
assert.equal(connection.protocolVersion, "0.1.0");
assert.equal(connection.skillPacket.skills.length, 5);
assert.deepEqual(
  connection.skillPacket.skills.map((skill) => skill.skillId),
  ["sayso.protocol", "sayso.runtime", "sayso.configure", "sayso.source", "sayso.demo.pong"],
);
assert.ok(connection.skillPacket.skill.capabilities.some((capability) => capability.capabilityId === "sayso.runtime.application"));
assert.ok(connection.skillPacket.skill.capabilities.some((capability) => capability.capabilityId === "sayso.configure.read"));
assert.ok(connection.skillPacket.skill.capabilities.some((capability) => capability.capabilityId === "sayso.source.snapshot"));
assert.ok(connection.skillPacket.skill.channels[0]?.contentTypes?.includes("sayso.source/source-manifest-request/1"));
assert.ok(connection.skillPacket.skill.channels[0]?.contentTypes?.includes("sayso.source/source-chunk-response/1"));
assert.deepEqual((connection.skillPacket.skill.runtime as { applications?: Array<{ appId: string }> }).applications?.[0]?.appId, "sayso.demo.pong");
assert.deepEqual(
  (connection.skillPacket.skill.runtime as { applications?: Array<{ source?: { entrypoint?: string } }> }).applications?.[0]?.source?.entrypoint,
  PONG_RUNTIME_ENTRYPOINT,
);

const agentInfo = createAgentInfo({
  agent: {
    agentId: "sayso-demo-pong",
    syncInboxId: "inbox",
    displayName: "SaySo Demo Pong",
  },
  skillPacket: createPongSkillPacket({
    agentId: "sayso-demo-pong",
    syncInboxId: "inbox",
    displayName: "SaySo Demo Pong",
  }),
});
assert.equal(agentInfo.skillPacket.resolution.mode, "all");

const skillResponse = createSkillResponse({
  agent: {
    agentId: "sayso-demo-pong",
    kind: "service",
    syncInboxId: "inbox",
    displayName: "SaySo Demo Pong",
  },
  resolvedSkill: createPongResolvedSkill("inbox"),
  skills: pongSkillDocuments(),
  request: { include: "all" },
  content: "# Pong",
});
assert.equal(skillResponse.status, "ok");
assert.equal(skillResponse.skills?.length, 5);
assert.equal(hasPongSkill(skillResponse), true);
assert.equal(skillResponse.skill.paymentPolicies.length, 0);

const pongWallet = "0x3886296d75dfde23eb0e99b64739800327848303";
const networkRegistration = createPongNetworkRegistration({
  syncInboxId: "inbox_live",
  walletAddress: pongWallet,
});
assert.equal(networkRegistration.agent.agentId, pongAgentId(pongWallet));
assert.equal(networkRegistration.agent.syncInboxId, "inbox_live");
assert.equal(networkRegistration.profile?.skillDisclosure, "include-skill-packet");
assert.equal(networkRegistration.profile?.skillPacket?.agent.agentId, pongAgentId(pongWallet));
assert.equal(networkRegistration.profile?.skillPacket?.agent.syncInboxId, "inbox_live");
assert.equal(networkRegistration.profile?.skillPacket?.skill.channels[0]?.inboxId, "inbox_live");
assert.deepEqual(
  networkRegistration.profile?.skillPacket?.skills.map((skill) => skill.skillId),
  ["sayso.protocol", "sayso.runtime", "sayso.configure", "sayso.source", "sayso.demo.pong"],
);
assert.match(networkRegistration.profile?.skillPacket?.skills[0]?.content ?? "", /## Startup/);
assert.match(networkRegistration.profile?.skillPacket?.skills[1]?.content ?? "", /## Host ABI/);
assert.match(networkRegistration.profile?.skillPacket?.skills[2]?.content ?? "", /## Payloads/);
assert.match(networkRegistration.profile?.skillPacket?.skills[3]?.content ?? "", /## Payloads/);
assert.match(networkRegistration.profile?.skillPacket?.skills[4]?.content ?? "", /## Payloads/);
assert.equal(networkRegistration.profile?.skillPacket?.skills[0]?.mediaType, "text/markdown");
assert.equal(networkRegistration.profile?.skillPacket?.skills[1]?.mediaType, "text/markdown");
assert.equal(networkRegistration.profile?.skillPacket?.skills[2]?.mediaType, "text/markdown");
assert.equal(networkRegistration.profile?.skillPacket?.skills[3]?.mediaType, "text/markdown");
assert.equal(networkRegistration.profile?.skillPacket?.skills[4]?.mediaType, "text/markdown");

const registrationSubmitCodec = saysoCodecs.find((codec) =>
  contentTypesAreEqual(codec.contentType, CONTENT_TYPES.registrationSubmit),
);
assert.ok(registrationSubmitCodec);
assert.deepEqual(registrationSubmitCodec.decode(registrationSubmitCodec.encode(networkRegistration)), networkRegistration);

const premiumRegistration = {
  requestId: "premium_reg_1",
  agent: {
    agentId: "sayso-demo-pong",
    syncInboxId: "inbox_live",
    displayName: "SaySo Demo Pong",
    protocolVersion: "0.1.0",
  },
  visibility: "public",
  profile: {
    description: "Premium pong registration.",
    skillDisclosure: "summary-only",
  },
} as const;
const premiumRegistrationSubmitCodec = saysoCodecs.find((codec) =>
  contentTypesAreEqual(codec.contentType, CONTENT_TYPES.premiumRegistrationSubmit),
);
assert.ok(premiumRegistrationSubmitCodec);
assert.deepEqual(
  premiumRegistrationSubmitCodec.decode(premiumRegistrationSubmitCodec.encode(premiumRegistration)),
  premiumRegistration,
);

const acceptedRegistration = {
  requestId: "network_reg_1",
  status: "accepted",
  registrationId: "reg_1",
  visibility: "public",
  updatedAt: "2026-05-01T12:00:00.000Z",
} as const;
const rejectedRegistration = {
  requestId: "network_reg_2",
  status: "rejected",
  error: {
    code: "policy",
    message: "Registration rejected by policy.",
  },
} as const;
const registrationResultCodec = saysoCodecs.find((codec) =>
  contentTypesAreEqual(codec.contentType, CONTENT_TYPES.registrationResult),
);
assert.ok(registrationResultCodec);
assert.deepEqual(registrationResultCodec.decode(registrationResultCodec.encode(acceptedRegistration)), acceptedRegistration);
assert.deepEqual(registrationResultCodec.decode(registrationResultCodec.encode(rejectedRegistration)), rejectedRegistration);

const configurationResponse: ConfigurationResponsePayload = {
  requestId: "config_req",
  status: "ok",
  variables: [
    {
      name: "PUBLIC_BASE_URL",
      visibility: "public",
      valueType: "url",
      value: "https://agent.example",
    },
    {
      name: "OPENAI_API_KEY",
      visibility: "private",
      valueType: "secret",
      required: true,
    },
  ],
};
const configurationResponseCodec = saysoCodecs.find((codec) =>
  contentTypesAreEqual(codec.contentType, CONTENT_TYPES.configurationResponse),
);
assert.ok(configurationResponseCodec);
assert.deepEqual(
  configurationResponseCodec.decode(configurationResponseCodec.encode(configurationResponse)),
  configurationResponse,
);

const pongConfigurationResponse = createPongConfigurationResponse(
  { requestId: "config_pong" },
  {
    xmtpEnv: "dev",
    networkAgent: "0xc9f639a95813c834967fb8a38f749ea5f0b5cdd9",
    debug: "info",
    dbDir: ".data/xmtp",
  },
  "2026-05-05T12:00:00.000Z",
);
assert.equal(pongConfigurationResponse.status, "ok");
if (pongConfigurationResponse.status !== "ok") throw new Error("expected pong configuration ok response");
assert.deepEqual(
  pongConfigurationResponse.variables.map((variable) => variable.name),
  ["XMTP_ENV", "SAYSO_NETWORK_AGENT", "DEBUG", "XMTP_PRIVATE_KEY", "XMTP_DB_ENCRYPTION_KEY", "XMTP_DB_DIR"],
);
assert.equal(pongConfigurationResponse.variables.find((variable) => variable.name === "XMTP_ENV")?.value, "dev");
assert.equal(
  Object.prototype.hasOwnProperty.call(
    pongConfigurationResponse.variables.find((variable) => variable.name === "XMTP_PRIVATE_KEY") ?? {},
    "value",
  ),
  false,
);

const filteredPongConfigurationResponse = createPongConfigurationResponse(
  { requestId: "config_filtered", names: ["XMTP_ENV", "XMTP_PRIVATE_KEY", "UNKNOWN"], includeValues: "none" },
  {
    xmtpEnv: "production",
    networkAgent: "xmtp_inbox_network",
    dbDir: "/tmp/xmtp",
  },
  "2026-05-05T12:01:00.000Z",
);
assert.equal(filteredPongConfigurationResponse.status, "ok");
if (filteredPongConfigurationResponse.status !== "ok") throw new Error("expected filtered pong configuration ok response");
assert.deepEqual(
  filteredPongConfigurationResponse.variables.map((variable) => variable.name),
  ["XMTP_ENV", "XMTP_PRIVATE_KEY"],
);
assert.equal(
  filteredPongConfigurationResponse.variables.some((variable) =>
    Object.prototype.hasOwnProperty.call(variable, "value"),
  ),
  false,
);

const sourceChunkResponse: SourceChunkResponsePayload = {
  requestId: "source_chunk",
  status: "ok",
  snapshotId: "snapshot_1",
  target: { kind: "file", path: "src/agent.ts" },
  chunkIndex: 0,
  chunkCount: 1,
  sha256: "57ea3db3367d8ae13832f1b2998b430ebb5c305fa7136f642a094d2f22d20a9f",
  bytesBase64: "ZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSAoKSA9PiAncG9uZyc7Cg==",
};
const sourceChunkResponseCodec = saysoCodecs.find((codec) =>
  contentTypesAreEqual(codec.contentType, CONTENT_TYPES.sourceChunkResponse),
);
assert.ok(sourceChunkResponseCodec);
assert.deepEqual(sourceChunkResponseCodec.decode(sourceChunkResponseCodec.encode(sourceChunkResponse)), sourceChunkResponse);

const sourceSnapshots: PongSourceSnapshotStore = new Map();
const handlerPath = "examples/pong/src/pong/handler.ts";
const sourceManifestResponse = createPongSourceManifestResponse(
  {
    requestId: "source_manifest_pong",
    include: [handlerPath],
    maxChunkSizeBytes: 16,
  },
  sourceSnapshots,
  {
    now: new Date("2026-05-05T12:00:00.000Z"),
    snapshotId: "snapshot_pong",
  },
);
assert.equal(sourceManifestResponse.status, "ok");
if (sourceManifestResponse.status !== "ok") throw new Error("expected source manifest ok response");
assert.equal(sourceManifestResponse.chunkSizeBytes, 16);
assert.equal(sourceManifestResponse.files.length, 1);
assert.equal(sourceManifestResponse.files[0]?.path, handlerPath);
const sourceSnapshot = sourceSnapshots.get("snapshot_pong");
assert.ok(sourceSnapshot);
const handlerFile = sourceSnapshot.files.get(handlerPath);
assert.ok(handlerFile);
assert.equal(sourceManifestResponse.files[0]?.sha256, createHash("sha256").update(handlerFile.bytes).digest("hex"));

const pongSourceChunkResponse = createPongSourceChunkResponse(
  {
    requestId: "source_chunk_pong",
    snapshotId: "snapshot_pong",
    target: { kind: "file", path: handlerPath },
    chunkIndex: 0,
  },
  sourceSnapshots,
  new Date("2026-05-05T12:01:00.000Z"),
);
assert.equal(pongSourceChunkResponse.status, "ok");
if (pongSourceChunkResponse.status !== "ok") throw new Error("expected source chunk ok response");
const expectedChunk = handlerFile.bytes.subarray(0, 16);
assert.equal(pongSourceChunkResponse.chunkCount, handlerFile.entry.chunks);
assert.equal(pongSourceChunkResponse.bytesBase64, expectedChunk.toString("base64"));
assert.equal(pongSourceChunkResponse.sha256, createHash("sha256").update(expectedChunk).digest("hex"));

const filteredSourceManifestResponse = createPongSourceManifestResponse(
  {
    requestId: "source_manifest_filtered",
    include: ["examples/pong/src/pong"],
    exclude: [handlerPath],
  },
  sourceSnapshots,
  {
    now: new Date("2026-05-05T12:02:00.000Z"),
    snapshotId: "snapshot_filtered",
  },
);
assert.equal(filteredSourceManifestResponse.status, "ok");
if (filteredSourceManifestResponse.status !== "ok") throw new Error("expected filtered source manifest ok response");
assert.equal(filteredSourceManifestResponse.files.some((file) => file.path === handlerPath), false);
assert.ok(filteredSourceManifestResponse.files.some((file) => file.path === "examples/pong/src/pong/source.ts"));

const runtimeSourceManifestResponse = createPongSourceManifestResponse(
  {
    requestId: "source_manifest_runtime",
    include: [PONG_RUNTIME_ENTRYPOINT, PONG_RUNTIME_BYTECODE],
  },
  sourceSnapshots,
  {
    now: new Date("2026-05-05T12:02:30.000Z"),
    snapshotId: "snapshot_runtime",
  },
);
assert.equal(runtimeSourceManifestResponse.status, "ok");
if (runtimeSourceManifestResponse.status !== "ok") throw new Error("expected runtime source manifest ok response");
assert.deepEqual(
  runtimeSourceManifestResponse.files.map((file) => file.path).sort(),
  [PONG_RUNTIME_BYTECODE, PONG_RUNTIME_ENTRYPOINT].sort(),
);
assert.deepEqual(runtimeSourceManifestResponse.runtimeArtifacts?.[0]?.bytecode, PONG_RUNTIME_BYTECODE_METADATA);
assert.equal(runtimeSourceManifestResponse.runtimeArtifacts?.[0]?.sourcePath, PONG_RUNTIME_ENTRYPOINT);
assert.equal(runtimeSourceManifestResponse.runtimeArtifacts?.[0]?.bytecodePath, PONG_RUNTIME_BYTECODE);

const archiveManifestResponse = createPongSourceManifestResponse(
  { requestId: "source_archive_manifest", format: "tar.gz" },
  sourceSnapshots,
  {
    now: new Date("2026-05-05T12:03:00.000Z"),
    snapshotId: "snapshot_archive_manifest",
  },
);
assert.equal(archiveManifestResponse.status, "error");
if (archiveManifestResponse.status !== "error") throw new Error("expected archive manifest error response");
assert.equal(archiveManifestResponse.error.code, "policy");

const archiveChunkResponse = createPongSourceChunkResponse(
  {
    requestId: "source_archive_chunk",
    snapshotId: "snapshot_pong",
    target: { kind: "archive", format: "tar.gz" },
    chunkIndex: 0,
  },
  sourceSnapshots,
  new Date("2026-05-05T12:04:00.000Z"),
);
assert.equal(archiveChunkResponse.status, "error");
if (archiveChunkResponse.status !== "error") throw new Error("expected archive chunk error response");
assert.equal(archiveChunkResponse.error.code, "policy");

const missingSnapshotResponse = createPongSourceChunkResponse(
  {
    requestId: "source_missing_snapshot",
    snapshotId: "missing_snapshot",
    target: { kind: "file", path: handlerPath },
    chunkIndex: 0,
  },
  sourceSnapshots,
  new Date("2026-05-05T12:05:00.000Z"),
);
assert.equal(missingSnapshotResponse.status, "error");
if (missingSnapshotResponse.status !== "error") throw new Error("expected missing snapshot error response");
assert.equal(missingSnapshotResponse.error.code, "not-found");

const expiredSnapshots: PongSourceSnapshotStore = new Map();
const expiredManifestResponse = createPongSourceManifestResponse(
  { requestId: "source_expired_manifest", include: [handlerPath] },
  expiredSnapshots,
  {
    now: new Date("2026-05-05T12:00:00.000Z"),
    snapshotId: "snapshot_expired",
  },
);
assert.equal(expiredManifestResponse.status, "ok");
const expiredChunkResponse = createPongSourceChunkResponse(
  {
    requestId: "source_expired_chunk",
    snapshotId: "snapshot_expired",
    target: { kind: "file", path: handlerPath },
    chunkIndex: 0,
  },
  expiredSnapshots,
  new Date(new Date("2026-05-05T12:00:00.000Z").getTime() + PONG_SOURCE_SNAPSHOT_TTL_MS + 1),
);
assert.equal(expiredChunkResponse.status, "error");
if (expiredChunkResponse.status !== "error") throw new Error("expected expired snapshot error response");
assert.equal(expiredChunkResponse.error.code, "snapshot-expired");
assert.equal(expiredSnapshots.has("snapshot_expired"), false);

const forkResult: ForkResultPayload = {
  requestId: "fork_req",
  status: "accepted",
  forkId: "fork_1",
  offerId: "fork-free-1h",
  provider: {
    providerId: "sayso-local",
  },
  validFrom: "2026-05-04T12:00:00.000Z",
  expiresAt: "2026-05-04T13:00:00.000Z",
};
const forkResultCodec = saysoCodecs.find((codec) =>
  contentTypesAreEqual(codec.contentType, CONTENT_TYPES.forkResult),
);
assert.ok(forkResultCodec);
assert.deepEqual(forkResultCodec.decode(forkResultCodec.encode(forkResult)), forkResult);

assert.equal(isPingRequest({ requestId: "ping_1" }), true);
assert.equal(isPingRequest({ message: "missing id" }), false);
assert.deepEqual(
  createPongResponse(
    { requestId: "ping_1", message: "hello" },
    "2026-04-30T20:00:00.000Z",
    "2026-04-30T20:00:00.100Z",
  ),
  {
    requestId: "ping_1",
    message: "pong",
    receivedMessage: "hello",
    receivedAt: "2026-04-30T20:00:00.000Z",
    respondedAt: "2026-04-30T20:00:00.100Z",
  },
);

const signerPrivateKeyMaterial = "eca791732d725a868c78ddefbb7868c6";
const quickJsLocalTextWrites: Array<{ message: string; channel?: string; format?: "plain" | "markdown" }> = [];
const quickJsHost = await createQuickJsApplication(
  `
  sayso.registerApplication({
    appId: "sayso.test.quickjs",
    runtime: { skillId: "sayso.runtime", abiVersion: "0.1.0" },
    hostOperations: [
      "params.get",
      "clock.nowIso",
      "id.generate",
      "signer.getAccount",
      "signer.signMessage",
      "local.text.write",
      "local.text.read"
    ],
    capabilities: {
      network: {
        https: ["https://api.example"],
        wss: ["wss://socket.example"],
      },
    },
    echo: async (input) => ({
      input,
      params: await sayso.call("params.get", {}),
      now: await sayso.call("clock.nowIso", {}),
      id: await sayso.call("id.generate", {}),
      account: await sayso.call("signer.getAccount", {}),
      localWrite: await sayso.call("local.text.write", {
        message: "hello local",
        channel: "status",
        format: "plain",
      }),
      localRead: await sayso.call("local.text.read", {
        prompt: "Name?",
        defaultValue: "Ada",
        multiline: false,
        secret: false,
        timeoutMs: 1000,
      }),
      globals: {
        fetch: typeof fetch,
        WebSocket: typeof WebSocket,
        saysoFrozen: Object.isFrozen(sayso),
      },
    }),
    sign: async () => await sayso.call("signer.signMessage", { message: "hello" }),
    invalidLocalWrite: async () => await sayso.call("local.text.write", { message: 7 }),
    invalidLocalRead: async () => await sayso.call("local.text.read", { timeoutMs: -1 }),
    badJson: async () => await sayso.call("clock.nowIso", { bad: () => null }),
    hostObject: async () => await sayso.call("test.hostObject", {}),
  });
  `,
  {
    params: { publicValue: "visible" },
    clock: { now: () => new Date("2026-05-06T12:00:00.000Z") },
    idGenerator: () => "id_quickjs",
    signer: {
      getAccount: () => ({ kind: "ethereum", address: pongWallet }),
      signMessage: ({ message }) => {
        void signerPrivateKeyMaterial;
        return {
          account: { kind: "ethereum", address: pongWallet },
          message,
          signature: "0x1234",
          signatureEncoding: "hex",
        };
      },
    },
    localText: {
      write: (input) => {
        quickJsLocalTextWrites.push(input);
      },
      read: (input) => ({
        status: "ok",
        value: input.defaultValue ?? "",
      }),
    },
    operations: {
      "test.hostObject": () => new Date("2026-05-06T12:00:00.000Z") as unknown as JsonValue,
    },
  },
);
assert.equal(quickJsHost.application.appId, "sayso.test.quickjs");
assert.deepEqual(quickJsHost.application.runtime, { skillId: "sayso.runtime", abiVersion: "0.1.0" });
assert.deepEqual(quickJsHost.application.hostOperations, [
  "params.get",
  "clock.nowIso",
  "id.generate",
  "signer.getAccount",
  "signer.signMessage",
  "local.text.write",
  "local.text.read",
]);
assert.deepEqual(await quickJsHost.call("echo", { requestId: "host_1" }), {
  input: { requestId: "host_1" },
  params: { publicValue: "visible" },
  now: "2026-05-06T12:00:00.000Z",
  id: "id_quickjs",
  account: { kind: "ethereum", address: pongWallet },
  localWrite: { status: "ok" },
  localRead: { status: "ok", value: "Ada" },
  globals: {
    fetch: "undefined",
    WebSocket: "undefined",
    saysoFrozen: true,
  },
});
assert.deepEqual(quickJsLocalTextWrites, [
  {
    message: "hello local",
    channel: "status",
    format: "plain",
  },
]);
assert.deepEqual(await quickJsHost.call("sign", {}), {
  account: { kind: "ethereum", address: pongWallet },
  message: "hello",
  signature: "0x1234",
  signatureEncoding: "hex",
});
assert.equal(JSON.stringify(await quickJsHost.call("sign", {})).includes(signerPrivateKeyMaterial), false);
await assert.rejects(() => quickJsHost.call("invalidLocalWrite", {}), /local\.text\.write requires a string message/);
await assert.rejects(() => quickJsHost.call("invalidLocalRead", {}), /local\.text\.read timeoutMs must be a non-negative integer/);
await assert.rejects(() => quickJsHost.call("badJson", {}), /JSON-serializable/);
await assert.rejects(() => quickJsHost.call("hostObject", {}), /JSON-serializable/);
quickJsHost.dispose();

const quickJsMissingLocalText = await createQuickJsApplication(
  `
  sayso.registerApplication({
    appId: "sayso.test.local-missing",
    write: async () => await sayso.call("local.text.write", { message: "hello" }),
    read: async () => await sayso.call("local.text.read", {}),
  });
  `,
);
await assert.rejects(() => quickJsMissingLocalText.call("write", {}), /local\.text\.write is not configured/);
await assert.rejects(() => quickJsMissingLocalText.call("read", {}), /local\.text\.read is not configured/);
quickJsMissingLocalText.dispose();

let quickJsNetworkOpened = false;
const quickJsDeniedNetwork = await createQuickJsApplication(
  `
  sayso.registerApplication({
    appId: "sayso.test.network",
    capabilities: { network: { https: ["https://api.example"] } },
    request: async () => await sayso.call("network.https.request", { url: "https://api.example/path" }),
  });
  `,
  {
    networkPolicy: () => false,
    network: {
      httpsRequest: () => {
        quickJsNetworkOpened = true;
        return { ok: true };
      },
    },
  },
);
await assert.rejects(() => quickJsDeniedNetwork.call("request", {}), /denied/);
assert.equal(quickJsNetworkOpened, false);
quickJsDeniedNetwork.dispose();

const runtimeAppSource = readPongRuntimeAppSource();
assert.ok(runtimeAppSource.includes("const createApplication = ({ sayso })"));
assert.ok(runtimeAppSource.includes("sayso.registerApplication(createApplication({ sayso }))"));
for (const [name, pattern] of [
  ["static import", /^\s*import\s/m],
  ["dynamic import", /\bimport\s*\(/],
  ["require", /\brequire\s*\(/],
  ["fetch", /\bfetch\s*\(/],
  ["WebSocket", /\bnew\s+WebSocket\b/],
  ["XMLHttpRequest", /\bnew\s+XMLHttpRequest\b/],
  ["EventSource", /\bnew\s+EventSource\b/],
  ["importScripts", /\bimportScripts\s*\(/],
  ["process", /\bprocess\s*\.\s*env|\bglobalThis\s*\.\s*process/],
  ["Buffer", /\bBuffer\s*[.(]/],
] as const) {
  assert.equal(pattern.test(runtimeAppSource), false, `${PONG_RUNTIME_APP_FILENAME} contains ${name}`);
}
const standaloneRuntimeApp = await createQuickJsApplication(runtimeAppSource);
assert.equal(standaloneRuntimeApp.application.appId, "sayso.demo.pong");
assert.deepEqual(standaloneRuntimeApp.application.runtime, { skillId: "sayso.runtime", abiVersion: "0.1.0" });
assert.deepEqual(standaloneRuntimeApp.application.source, {
  skillId: "sayso.source",
  format: "files",
  entrypoint: PONG_RUNTIME_ENTRYPOINT,
  include: [PONG_RUNTIME_ENTRYPOINT, PONG_RUNTIME_BYTECODE],
});
standaloneRuntimeApp.dispose();

const quickJsPongClockValues = [
  "2026-05-06T12:00:00.000Z",
  "2026-05-06T12:00:00.100Z",
  "2026-05-06T12:01:00.000Z",
];
const quickJsPongClock = {
  now: () => new Date(quickJsPongClockValues.shift() ?? "2026-05-06T12:01:00.000Z"),
};
const quickJsPongAgent = {
  agentId: pongAgentId(pongWallet),
  syncInboxId: "inbox_quickjs",
  displayName: "SaySo Demo Pong",
};
const quickJsPongConfiguration = {
  xmtpEnv: "dev",
  networkAgent: "xmtp_inbox_network",
  debug: "info",
  dbDir: ".data/xmtp",
};
const quickJsPong = await createQuickJsPongApplication({
  agent: quickJsPongAgent,
  configuration: quickJsPongConfiguration,
  sourceSnapshots: new Map(),
  host: {
    clock: quickJsPongClock,
  },
});
const quickJsPingReplies = await quickJsPong.handleMessage({
  key: "pingRequest",
  contentType: "sayso.demo.pong/ping-request/1",
  content: { requestId: "ping_quickjs", message: "hello" },
  senderInboxId: "sender_quickjs",
  conversationId: "conversation_quickjs",
});
assert.equal(quickJsPingReplies?.length, 1);
assert.ok(contentTypesAreEqual(quickJsPingReplies?.[0]?.contentType, CONTENT_TYPES.pongResponse));
assert.deepEqual(
  quickJsPingReplies?.[0]?.content,
  createPongResponse(
    { requestId: "ping_quickjs", message: "hello" },
    "2026-05-06T12:00:00.000Z",
    "2026-05-06T12:00:00.100Z",
  ),
);

const quickJsMalformedPingReplies = await quickJsPong.handleMessage({
  key: "pingRequest",
  contentType: "sayso.demo.pong/ping-request/1",
  content: { message: "missing id" },
  senderInboxId: "sender_quickjs",
  conversationId: "conversation_quickjs",
});
assert.equal(quickJsMalformedPingReplies?.length, 1);
assert.ok(contentTypesAreEqual(quickJsMalformedPingReplies?.[0]?.contentType, CONTENT_TYPES.error));
assert.deepEqual(quickJsMalformedPingReplies?.[0]?.content, {
  code: "malformed",
  message: "Invalid ping-request/1 payload.",
});

const quickJsConfigurationReplies = await quickJsPong.handleMessage({
  key: "configurationRequest",
  contentType: "sayso.configure/configuration-request/1",
  content: { requestId: "config_quickjs" },
  senderInboxId: "sender_quickjs",
  conversationId: "conversation_quickjs",
});
assert.equal(quickJsConfigurationReplies?.length, 1);
assert.ok(contentTypesAreEqual(quickJsConfigurationReplies?.[0]?.contentType, CONTENT_TYPES.configurationResponse));
assert.deepEqual(
  quickJsConfigurationReplies?.[0]?.content,
  createPongConfigurationResponse(
    { requestId: "config_quickjs" },
    quickJsPongConfiguration,
    "2026-05-06T12:01:00.000Z",
  ),
);

assert.deepEqual(
  await quickJsPong.disconnect({
    agent: quickJsPongAgent,
    senderInboxId: "sender_quickjs",
    conversationId: "conversation_quickjs",
  }),
  {
    contentType: CONTENT_TYPES.disconnectAck,
    content: {
      action: "disconnect",
      status: "ok",
      details: { closed: ["connection_state"] },
    },
  },
);
assert.deepEqual(
  await quickJsPong.forgetMe({
    agent: quickJsPongAgent,
    senderInboxId: "sender_quickjs",
    conversationId: "conversation_quickjs",
  }),
  {
    contentType: CONTENT_TYPES.disconnectAck,
    content: {
      action: "forget-me",
      status: "ok",
      details: { deleted: ["connection_state", "onboarding_state"] },
    },
  },
);
quickJsPong.dispose();

console.log("unit tests passed");
