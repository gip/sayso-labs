import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type {
  SourceChunkRequestPayload,
  SourceChunkResponsePayload,
  SourceChunkTarget,
  SourceFileEntry,
  SourceManifestRequestPayload,
  SourceManifestResponsePayload,
  SourceRuntimeArtifact,
} from "../sayso/types.js";
import { PONG_RUNTIME_BYTECODE_METADATA } from "./runtimeBytecode.js";

export const PONG_SOURCE_DEFAULT_CHUNK_SIZE_BYTES = 64 * 1024;
export const PONG_SOURCE_SNAPSHOT_TTL_MS = 30 * 60 * 1000;
export const PONG_RUNTIME_SOURCE_PATH = "examples/pong/src/pong/runtime-app.js";
export const PONG_RUNTIME_BYTECODE_PATH = "examples/pong/src/pong/runtime-app.qjsc";

export const PONG_SOURCE_PATHS = [
  "examples/pong/package.json",
  "examples/pong/scripts/copy-runtime-app.mjs",
  "examples/pong/tsconfig.json",
  "examples/pong/src/cli/options.ts",
  "examples/pong/src/cli/pong-agent.ts",
  "examples/pong/src/pong/application.ts",
  "examples/pong/src/pong/configuration.ts",
  "examples/pong/src/pong/handler.ts",
  "examples/pong/src/pong/networkRegistration.ts",
  "examples/pong/src/pong/quickjs.ts",
  PONG_RUNTIME_SOURCE_PATH,
  PONG_RUNTIME_BYTECODE_PATH,
  "examples/pong/src/pong/source.ts",
  "examples/pong/src/pong/skill.ts",
  "examples/pong/src/pong/types.ts",
  "examples/pong/src/sayso/codecs.ts",
  "examples/pong/src/sayso/constants.ts",
  "examples/pong/src/sayso/contentTypes.ts",
  "examples/pong/src/sayso/identity.ts",
  "examples/pong/src/sayso/markdown.ts",
  "examples/pong/src/sayso/protocol.ts",
  "examples/pong/src/sayso/quickjs.ts",
  "examples/pong/src/sayso/types.ts",
  "examples/pong/src/sayso/validation.ts",
  "examples/pong/src/sayso/xmtp.ts",
  "examples/skills/pong/SKILL.md",
  "skills/sayso-protocol/SKILL.md",
  "skills/sayso-runtime/SKILL.md",
  "skills/sayso-configure/SKILL.md",
  "skills/sayso-source/SKILL.md",
] as const;

export type PongSourceFile = {
  entry: SourceFileEntry;
  bytes: Buffer;
};

export type PongSourceSnapshot = {
  snapshotId: string;
  createdAtMs: number;
  expiresAtMs: number;
  chunkSizeBytes: number;
  files: Map<string, PongSourceFile>;
};

export type PongSourceSnapshotStore = Map<string, PongSourceSnapshot>;

const findRepoRoot = () => {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../.."),
    path.resolve(process.cwd(), "../../.."),
  ];
  const root = candidates.find(
    (candidate) =>
      existsSync(path.join(candidate, "skills/sayso-protocol/SKILL.md")) &&
      existsSync(path.join(candidate, "examples")),
  );
  if (!root) throw new Error("Unable to locate SaySo repository root for source snapshot.");
  return root;
};

const sha256 = (bytes: Buffer | Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

const mediaTypeFor = (relativePath: string) => {
  if (relativePath.endsWith(".qjsc")) return "application/vnd.sayso.quickjs-bytecode";
  if (relativePath.endsWith(".js") || relativePath.endsWith(".mjs")) return "text/javascript";
  if (relativePath.endsWith(".ts")) return "text/typescript";
  if (relativePath.endsWith(".json")) return "application/json";
  if (relativePath.endsWith(".md")) return "text/markdown";
  return "text/plain";
};

const isExecutable = (absolutePath: string) => (statSync(absolutePath).mode & 0o111) !== 0;

const isSafeRelativePath = (value: string) =>
  value.length > 0 &&
  !value.startsWith("/") &&
  !value.includes("//") &&
  !value.split("/").includes("..");

const normalizePattern = (value: string) => value.replace(/\/+$/, "");

const matchesPattern = (relativePath: string, pattern: string) => {
  const normalized = normalizePattern(pattern);
  return relativePath === normalized || relativePath.startsWith(`${normalized}/`);
};

const matchesFilters = (relativePath: string, request: SourceManifestRequestPayload) => {
  if (request.include?.length && !request.include.some((pattern) => matchesPattern(relativePath, pattern))) {
    return false;
  }
  if (request.exclude?.some((pattern) => matchesPattern(relativePath, pattern))) {
    return false;
  }
  return true;
};

const createSourceManifestError = (
  requestId: string,
  code: Extract<SourceManifestResponsePayload, { status: "error" }>["error"]["code"],
  message: string,
): SourceManifestResponsePayload => ({
  requestId,
  status: "error",
  error: {
    code,
    message,
  },
});

export const createPongSourceChunkError = (
  requestId: string,
  code: Extract<SourceChunkResponsePayload, { status: "error" }>["error"]["code"],
  message: string,
): SourceChunkResponsePayload => ({
  requestId,
  status: "error",
  error: {
    code,
    message,
  },
});

const buildSourceFile = (repoRoot: string, relativePath: string, chunkSizeBytes: number): PongSourceFile => {
  const absolutePath = path.join(repoRoot, relativePath);
  const bytes = readFileSync(absolutePath);
  const entry: SourceFileEntry = {
    path: relativePath,
    kind: "file",
    sizeBytes: bytes.length,
    sha256: sha256(bytes),
    chunks: Math.max(1, Math.ceil(bytes.length / chunkSizeBytes)),
    mediaType: mediaTypeFor(relativePath),
  };
  if (isExecutable(absolutePath)) entry.executable = true;
  return { entry, bytes };
};

const createRuntimeArtifacts = (files: Map<string, PongSourceFile>): SourceRuntimeArtifact[] => {
  if (!files.has(PONG_RUNTIME_SOURCE_PATH) || !files.has(PONG_RUNTIME_BYTECODE_PATH)) return [];
  return [
    {
      artifactId: "sayso-demo-pong-quickjs-bytecode",
      kind: "runtime-bytecode",
      language: {
        id: "javascript",
        version: "ES2023",
        profile: "sayso-runtime-single-script",
      },
      sourcePath: PONG_RUNTIME_SOURCE_PATH,
      bytecodePath: PONG_RUNTIME_BYTECODE_PATH,
      bytecode: PONG_RUNTIME_BYTECODE_METADATA,
    },
  ];
};

const pruneExpiredSnapshots = (snapshots: PongSourceSnapshotStore, nowMs: number) => {
  for (const [snapshotId, snapshot] of snapshots) {
    if (snapshot.expiresAtMs < nowMs) snapshots.delete(snapshotId);
  }
};

export const createPongSourceManifestResponse = (
  request: SourceManifestRequestPayload,
  snapshots: PongSourceSnapshotStore,
  options: {
    now?: Date;
    snapshotId?: string;
    repoRoot?: string;
  } = {},
): SourceManifestResponsePayload => {
  if (request.format && request.format !== "files") {
    return createSourceManifestError(request.requestId, "policy", "Archive snapshots are not supported by this pong agent.");
  }
  if (request.include?.some((item) => !isSafeRelativePath(item)) || request.exclude?.some((item) => !isSafeRelativePath(item))) {
    return createSourceManifestError(request.requestId, "malformed", "include and exclude entries must be safe relative paths.");
  }

  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  pruneExpiredSnapshots(snapshots, nowMs);
  const requestedChunkSize = request.maxChunkSizeBytes ?? PONG_SOURCE_DEFAULT_CHUNK_SIZE_BYTES;
  const chunkSizeBytes = Math.min(PONG_SOURCE_DEFAULT_CHUNK_SIZE_BYTES, requestedChunkSize);
  const repoRoot = options.repoRoot ?? findRepoRoot();
  const files = new Map<string, PongSourceFile>();

  for (const relativePath of PONG_SOURCE_PATHS) {
    if (!matchesFilters(relativePath, request)) continue;
    files.set(relativePath, buildSourceFile(repoRoot, relativePath, chunkSizeBytes));
  }

  const snapshotId = options.snapshotId ?? `pong_${nowMs}_${randomUUID()}`;
  const runtimeArtifacts = createRuntimeArtifacts(files);
  const snapshot: PongSourceSnapshot = {
    snapshotId,
    createdAtMs: nowMs,
    expiresAtMs: nowMs + PONG_SOURCE_SNAPSHOT_TTL_MS,
    chunkSizeBytes,
    files,
  };
  snapshots.set(snapshotId, snapshot);

  return {
    requestId: request.requestId,
    status: "ok",
    snapshotId,
    createdAt: now.toISOString(),
    expiresAt: new Date(snapshot.expiresAtMs).toISOString(),
    chunkSizeBytes,
    files: [...files.values()].map((file) => file.entry),
    ...(runtimeArtifacts.length ? { runtimeArtifacts } : {}),
  };
};

const targetKey = (target: SourceChunkTarget) =>
  target.kind === "file" ? `file:${target.path}` : `archive:${target.format}`;

export const createPongSourceChunkResponse = (
  request: SourceChunkRequestPayload,
  snapshots: PongSourceSnapshotStore,
  now = new Date(),
): SourceChunkResponsePayload => {
  if (request.target.kind === "archive") {
    return createPongSourceChunkError(request.requestId, "policy", "Archive snapshots are not supported by this pong agent.");
  }

  const snapshot = snapshots.get(request.snapshotId);
  if (!snapshot) {
    return createPongSourceChunkError(request.requestId, "not-found", "Unknown source snapshot.");
  }
  if (snapshot.expiresAtMs < now.getTime()) {
    snapshots.delete(request.snapshotId);
    return createPongSourceChunkError(request.requestId, "snapshot-expired", "Source snapshot has expired.");
  }

  const file = snapshot.files.get(request.target.path);
  if (!file) {
    return createPongSourceChunkError(request.requestId, "not-found", `Unknown source chunk target ${targetKey(request.target)}.`);
  }
  if (request.chunkIndex >= file.entry.chunks) {
    return createPongSourceChunkError(request.requestId, "not-found", "Source chunk index is out of range.");
  }

  const start = request.chunkIndex * snapshot.chunkSizeBytes;
  const end = Math.min(file.bytes.length, start + snapshot.chunkSizeBytes);
  const chunk = file.bytes.subarray(start, end);

  return {
    requestId: request.requestId,
    status: "ok",
    snapshotId: request.snapshotId,
    target: request.target,
    chunkIndex: request.chunkIndex,
    chunkCount: file.entry.chunks,
    sha256: sha256(chunk),
    bytesBase64: chunk.toString("base64"),
  };
};
