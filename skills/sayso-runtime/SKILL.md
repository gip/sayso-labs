---
name: sayso-runtime
description: Optional SaySo skill for portable runtime applications with host-owned I/O.
---

# SaySo Runtime

Version: **0.1.0**.

This optional skill defines a portable application runtime boundary for SaySo
agents. It lets an agent keep business logic inside an isolated runtime program
while the host owns I/O, policy, wallet custody, XMTP transport, connection
state, and network sockets.

`sayso.runtime` is an ABI contract, not a QuickJS requirement. The reusable
QuickJS source and bytecode VM strategy is defined independently in the
top-level `sayso-vm/` package so other projects can use the same VM profile
without adopting SaySo protocol skills.

This skill imports:

- `sayso.protocol` version `^0.1.0`

## Skill Metadata

- `skillId = "sayso.runtime"`
- `kind = "extension"`
- imports `sayso.protocol` version `^0.1.0`
- no XMTP content types are defined by this skill

Agents advertise `sayso.runtime` when their application behavior can be driven
through the runtime ABI below. Service skills remain responsible for their own
wire content types and payload schemas.

## Host ABI

Runtime application code can only communicate with the host through:

```ts
declare const sayso: {
  registerApplication(application: RuntimeApplication): void;
  call(operation: RuntimeHostOperation, input: JsonObject): Promise<JsonValue>;
};
```

The host creates the runtime, installs `sayso`, loads application code, and then
invokes registered application callbacks. The host decides which callback names
are meaningful for the agent. Callback function references stay inside the
runtime; only callback inputs, callback outputs, registration metadata, and
host-call inputs and outputs cross the host boundary.

## JSON Boundary

All values crossing the host boundary MUST be JSON-serializable:

```ts
type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type JsonObject = { [key: string]: JsonValue };
```

Hosts MUST reject non-finite numbers, functions, symbols, cyclic objects,
runtime object handles, class instances that are not plain JSON objects, and
arbitrary host objects.

Runtime application code MUST NOT receive private keys, wallet objects, XMTP
clients, raw sockets, filesystem access, Node globals, `fetch`, `WebSocket`,
stdin/stdout handles, readline handles, or other direct I/O objects.

## Application Registration

```ts
type RuntimeApplication = {
  appId: string;
  runtime?: {
    skillId: "sayso.runtime";
    abiVersion: "0.1.0";
  };
  source?: RuntimeSource;
  capabilities?: RuntimeCapabilities;
  hostOperations?: string[];
  [callbackName: string]: unknown;
};

type RuntimeSource = {
  skillId: "sayso.source";
  format: "files";
  entrypoint: string;
  include?: string[];
  exclude?: string[];
};
```

Rules:

- `appId` identifies the runtime application, usually the service skill ID.
- `runtime.abiVersion`, when present, MUST be `"0.1.0"` for this version.
- `source`, when present, declares where a host can retrieve executable
  application source. `source.entrypoint` is a normalized relative path to the
  self-contained JavaScript file the host loads first.
- `capabilities` declares host resources the application may request.
- `hostOperations` lists the host operations the application expects to call.
  Operations outside the v1 set are application-specific and not portable
  unless another advertised skill defines them.
- Function-valued callback properties are application-defined and stay inside
  the runtime. The host invokes them with JSON input and expects JSON output.

## Source Entrypoint Metadata

Runtime applications that can be installed from an agent's `sayso.source`
snapshot SHOULD declare `source` metadata during application registration and
in the resolved skill contract's runtime application metadata.

Rules:

- `source.skillId` MUST be `"sayso.source"`.
- `source.format` MUST be `"files"` for this version.
- `source.entrypoint` MUST be a non-empty slash-separated relative path. It
  MUST NOT be absolute, contain empty path segments, or contain `..` segments.
- `source.include` and `source.exclude`, when present, use the same safe
  relative path rules as `sayso.source` manifest filters.
- Hosts MAY use `source.include` and `source.exclude` as manifest request
  filters. Hosts MUST verify all returned source chunk hashes and the final file
  hashes before loading the entrypoint.
- Hosts MUST reject installation when `source.entrypoint` is absent from the
  verified source snapshot.
- Compiled VM artifacts, such as SaySo VM QuickJS bytecode, are discovered
  through `sayso.source` manifest `runtimeArtifacts` entries. Source remains
  required as the fallback and audit artifact.
- Hosts that load SaySo VM QuickJS bytecode MUST verify the bytecode file
  hashes and check artifact `language`, `bytecode.engine`,
  `bytecode.engineVersion`, `bytecode.format`, `bytecode.formatVersion`,
  `bytecode.evalType`, and `bytecode.mediaType` before evaluating bytecode.

## Self-Contained JavaScript Application Profile

A runtime application MAY be packaged as a single self-contained JavaScript
script that uses the host-installed `sayso` object directly. This is an
authoring and packaging profile over the v0.1.0 ABI; it does not change the
ABI version.

Self-contained JavaScript applications MUST NOT depend on runtime imports,
`require`, dynamic module loading, external sandbox dependencies, direct I/O,
or host globals beyond the host-provided `sayso` object.

The standard single-script shape is:

```js
const createApplication = ({ sayso }) => ({
  appId: "example.service",
  runtime: {
    skillId: "sayso.runtime",
    abiVersion: "0.1.0",
  },
  async handleMessage(input) {
    return [];
  },
});

sayso.registerApplication(createApplication({ sayso }));
```

The factory input MUST NOT contain XMTP clients, wallet objects, private keys,
raw sockets, filesystem APIs, or other direct I/O handles. Runtime configuration
and public host state are retrieved as JSON through `params.get`. Signer access,
when allowed by the host, is exposed only through signer host operations.
Messages enter the application only through JSON callback inputs. Local user
text I/O, when allowed by the host, is exposed only through local text host
operations.

## Callback Boundary

Message-oriented callbacks receive opaque host metadata and JSON content:

```ts
type RuntimeMessageInput = {
  senderInboxId: string;
  conversationId: string;
  contentType: string;
  content: JsonValue;
  params?: JsonObject;
};

type RuntimeReply = {
  contentType: string;
  content: JsonValue;
};
```

Rules:

- `contentType` uses the shorthand form such as
  `sayso.demo.pong/ping-request/1`.
- The runtime returns zero or more `RuntimeReply` objects.
- The host validates reply content against the advertised skill contracts before
  sending whenever validation is available.
- XMTP send/receive, registration, connection lookup, connection lifecycle, and
  delivery retries remain host-owned.

## Host Operations

The v1 host operation set is intentionally small:

```ts
type RuntimeHostOperation =
  | "params.get"
  | "clock.nowIso"
  | "id.generate"
  | "signer.getAccount"
  | "signer.signMessage"
  | "local.text.write"
  | "local.text.read"
  | "network.https.request"
  | "network.wss.open";
```

Operation rules:

- `params.get` returns public runtime parameters and non-secret configuration
  metadata selected by the host.
- `clock.nowIso` returns the host clock as an ISO 8601 string.
- `id.generate` returns a host-generated unique string.
- `signer.getAccount` returns public account metadata only.
- `signer.signMessage` signs a caller-provided message through a host signer
  capability and returns public signature metadata.
- `local.text.write` asks the host to display local text to the user and
  returns `{ "status": "ok" }` after the host accepts the write.
- `local.text.read` asks the host to collect local text from the user and
  returns either text or a terminal status.
- Signer operations MUST NOT expose private key material or wallet internals.
- Unknown operations MUST fail without side effects.

## Local Text I/O

Local text operations are host-mediated I/O for the local user interface only.
They MUST NOT send or receive XMTP messages, open network connections, or expose
runtime code to direct stdin, stdout, terminal, browser, or native UI handles.

```ts
type RuntimeLocalTextWriteInput = {
  message: string;
  channel?: "stdout" | "stderr" | "status" | string;
  format?: "plain" | "markdown";
};

type RuntimeLocalTextWriteOutput = {
  status: "ok";
};

type RuntimeLocalTextReadInput = {
  prompt?: string;
  defaultValue?: string;
  multiline?: boolean;
  secret?: boolean;
  timeoutMs?: number;
};

type RuntimeLocalTextReadOutput =
  | { status: "ok"; value: string }
  | { status: "cancelled" | "timeout" | "unavailable"; message?: string };
```

Local text rules:

- `local.text.write` requires a string `message`. `channel` is a host hint; if
  omitted, the host chooses the default local output surface. `format` defaults
  to `"plain"`.
- `local.text.read` fields are host hints. `prompt` and `defaultValue`, when
  present, MUST be strings. `multiline` and `secret`, when present, MUST be
  booleans. `timeoutMs`, when present, MUST be a non-negative integer.
- Hosts MAY reject, deny, redact, log, transform, or ignore local text requests
  according to host policy.
- If local input is not available, denied by policy, cancelled by the user, or
  not completed before `timeoutMs`, the host MUST return a non-`ok` status
  rather than exposing direct I/O handles to the runtime.
- Hosts MUST NOT treat local text reads or writes as SaySo protocol messages.

## Network Capabilities

```ts
type RuntimeCapabilities = {
  network?: {
    https?: string[];
    wss?: string[];
  };
};
```

Network rules:

- `network.https.request` only opens `https:` URLs.
- `network.wss.open` only opens `wss:` URLs.
- The target origin MUST be declared in `capabilities.network.https` or
  `capabilities.network.wss`.
- The host MUST apply runtime policy approval before opening a network
  connection.
- If declaration or policy approval fails, the operation MUST fail before host
  I/O occurs.

## SaySo VM QuickJS Profile

QuickJS source packaging, QuickJS bytecode metadata, VM-level `io` modes,
`argv`, `stdio`, `https`, and `wss` capabilities, configuration and variable
injection, origin allow-list rules, and functional VM examples are defined in
`sayso-vm/SPEC.md`.

SaySo runtimes that use this profile SHOULD wrap the self-contained JavaScript
application source in a SaySo VM program envelope. Existing
`sayso.source.runtimeArtifacts` QuickJS fields correspond to the SaySo VM
QuickJS bytecode metadata profile. Hosts MUST verify file hashes and bytecode
metadata before loading bytecode and MUST use source fallback or reject the
program when compatibility cannot be proven.

The SaySo VM profile supports two IO modes. When `io` is omitted or
`{ "mode": "stdio" }`, the runtime follows the current argv/stdio profile.
When `io.mode` is `"jsonio"`, the envelope supplies `inputSchema` and
`outputSchema` JSON Schemas, direct callback inputs and outputs are validated
against those schemas, `params.get` exposes the `io` contract, and argv/stdio
capabilities and operations are not available.

## Schemata

This skill defines no XMTP wire payloads, content types, or claim presentation
schemas in v0.1.0.
