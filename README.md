# SaySo Reference

This repository contains the reference implementation, payload fixtures,
runnable examples, schema extraction/validation tooling, and SaySo Network service
for the SaySo protocol.

The normative protocol and skill specifications live in
[`gip/sayso`](https://github.com/gip/sayso). Treat this repository as
non-normative implementation support for that spec.

## SaySo

SaySo is a meta protocol for agents and humans. It uses XMTP for secure
communication, crypto-native identity for addressability and verification, and
optional skills for features such as payments.

This repo preserves the implementation side of SaySo: payload fixtures, schema
extraction/validation tooling, runnable CLI tools, example services, and the
SaySo Network reference service. The normative shareable skill docs remain in
`gip/sayso`, mirrored here byte-for-byte.

All initial protocol and skill versions are `0.1.0`.

## Start Here

- [`sayso-protocol/SKILL.md`](skills/sayso-protocol/SKILL.md): the mandatory SaySo meta
  protocol.
- [`sayso-payment/SKILL.md`](skills/sayso-payment/SKILL.md): an optional x402-shaped
  payment skill.
- [`sayso-upgrade/SKILL.md`](skills/sayso-upgrade/SKILL.md): an optional meta extension for
  per-conversation skill bundle upgrades.
- [`sayso-network/SKILL.md`](skills/sayso-network/SKILL.md): the optional service protocol
  for the canonical SaySo Network registry agent.
- [`sayso-claim/SKILL.md`](skills/sayso-claim/SKILL.md): an optional claim presentation
  catalog for World ID wallet and wallet-control claims.
- [`sayso-configure/SKILL.md`](skills/sayso-configure/SKILL.md): an optional read-only
  configuration discovery skill.
- [`sayso-source/SKILL.md`](skills/sayso-source/SKILL.md): an optional source directory
  snapshot and chunk retrieval skill.
- [`sayso-fork/SKILL.md`](skills/sayso-fork/SKILL.md): an optional skill for requesting
  time-limited agent forks.
- [`sayso-runtime/SKILL.md`](skills/sayso-runtime/SKILL.md): an optional runtime ABI for
  portable application logic with host-owned I/O.
- [`examples/`](examples/): payload fixtures, service skills, flows, and
  runnable demos.

Each `SKILL.md` ends with a `## Schemata` section containing the exact JSON
Schemas for the skill's wire payloads. Reference tooling extracts those schema
blocks directly from Markdown.

## Core Protocol

Every SaySo-compatible agent must support `sayso.protocol` version `0.1.0`.

Core content types use:

- `authorityId = "sayso.protocol"`
- `versionMinor = 0`
- JSON encoded as UTF-8 bytes

The shorthand `sayso.protocol/connection-request/1` means this XMTP custom
content type:

```ts
{
  authorityId: "sayso.protocol",
  typeId: "connection-request",
  versionMajor: 1,
  versionMinor: 0
}
```

The payload for `connection-request/1` may be empty JSON:

```json
{}
```

or may include generic claim presentations:

```json
{
  "presentations": [
    {
      "type": "sayso.claim.world-id.wallet",
      "payload": {}
    }
  ]
}
```

## Startup Flow

On connection, an agent must send `agent-info/1` with fallback text similar to:

```text
This agent speaks SaySo. This message is sayso.protocol/agent-info/1, an XMTP custom content type carrying the current skill packet plus this fallback text. To connect or refresh skills, send an XMTP custom content type with authorityId="sayso.protocol", typeId="connection-request", versionMajor=1, versionMinor=0, encoded as UTF-8 JSON payload {} or a payload with skill-defined claim presentations. The agent will reply with sayso.protocol/connection-response/1 including protocolVersion, verifiedClaims when applicable, and the current skillPacket.
```

The normal startup flow is:

1. Caller contacts the agent sync inbox.
2. Agent sends `agent-info/1` with fallback text and the current full skill
   packet.
3. Caller may send `connection-request/1` with payload `{}` or optional
   skill-defined `presentations` to connect, reconfirm, or refresh skills.
4. Agent replies with `connection-response/1`, including `protocolVersion`,
   optional `verifiedClaims`, and the current `skillPacket`.
5. Caller may send `skill-request/1` later for explicit rediscovery, filtered
   skill requests, or compatibility.

The `agent-info/1.skillPacket` and `connection-response/1.skillPacket` are
authoritative. Fallback text is informational only.

## Composable Skills

`skill-response/1` always includes a top-level `skill` field containing the
flattened resolved contract. Simple clients can use that directly.

Composable clients can request referenced skills:

```json
{
  "include": "all"
}
```

When available, the response includes:

- `skills`: separate skill documents that can import each other.
- `resolution`: metadata describing included skills and dependency order.
- `skill`: the deterministic flattened merge of compatible selected skills.

The baseline `sayso.protocol` skill is mandatory. Optional features are separate
skills and may be reused by different SaySo agents.

## Optional Payments

Payments are not part of the mandatory meta protocol. Agents that charge for
actions advertise the optional [`sayso-payment`](skills/sayso-payment/SKILL.md) skill.

The payment skill uses:

- `skillId = "sayso.payment"`
- `authorityId = "sayso.payment"`
- `version = "0.1.0"`

Paid service skill bundles must include `sayso.protocol`, `sayso.payment`, and the
service skill that defines the paid action.

## Optional Network Registry

The SaySo Network registry is a SaySo service agent, not part of the mandatory meta
protocol. Agents **SHOULD** register themselves by connecting over XMTP to the
canonical registry wallet:

```txt
0xc9F639A95813C834967FB8a38f749eA5F0b5CdD9
```

The registry exposes [`sayso-network`](skills/sayso-network/SKILL.md):

- `skillId = "sayso.network"`
- `authorityId = "sayso.network"`
- `version = "0.1.0"`

Agents use normal SaySo startup with the registry agent, then submit
`sayso.network/registration-submit/1`. Public registrations can be discovered
with `agent-query/1`; private registrations are stored but unlisted. The
registry agent does not advertise `sayso.upgrade` in v0.1.0.

## Optional Upgrades

Protocol upgrades are not part of the mandatory bootstrap protocol. Agents or
clients that support per-conversation skill bundle changes or protocol handoff
advertise
[`sayso-upgrade`](skills/sayso-upgrade/SKILL.md).

The upgrade skill uses:

- `skillId = "sayso.upgrade"`
- `authorityId = "sayso.upgrade"`
- `version = "0.1.0"`

An upgrade proposal either contains a complete target SaySo skill bundle or a
non-SaySo handoff protocol descriptor. It explicitly marks each affected skill as
kept, replaced, added, or removed. If the counterparty accepts a handoff, the
next message in that conversation is governed entirely by the target protocol
and there is no SaySo fallback in that conversation. SaySo remains mandatory for a
fresh startup connection.

## Claims

SaySo supports pluggable claim presentation systems. The mandatory meta protocol only
defines a generic `connection-request/1.presentations[]` envelope with string
`type` and object `payload`. Verification semantics are defined by claim
skills.

The first claim skill is [`sayso-claim`](skills/sayso-claim/SKILL.md), which defines
`sayso.claim.world-id.wallet` and `sayso.claim.wallet-control`. Agents advertise
supported claim presentations by including claim skills in their skill packet.
Service skills may also declare capability-level claim requirements with
extension fields such as `claimPolicy`.

## Configuration, Source Snapshots, and Forks

Agents can advertise [`sayso-configure`](skills/sayso-configure/SKILL.md) to expose
read-only configuration variable names and public values. Private variables are
listed by name and metadata only.

Agents can advertise [`sayso-source`](skills/sayso-source/SKILL.md) to expose source snapshots
through a manifest plus chunked file or archive retrieval. `sayso.source` imports
`sayso.configure` so clients can discover required runtime variables separately
from source code.

Agents can advertise [`sayso-fork`](skills/sayso-fork/SKILL.md) to offer time-limited
forks. The agent publishes duration-priced offers, callers select an offer and
provide fork-specific configuration, and paid forks use `sayso.payment` before
activation.

## Portable Runtime Applications

Agents can advertise [`sayso-runtime`](skills/sayso-runtime/SKILL.md) to state that their
application behavior is structured around a JSON-only host/runtime ABI. The
runtime owns business callbacks; the host owns XMTP transport, connection
state, signer custody, policy checks, and network I/O.

## Examples

- [`examples/payloads/`](examples/payloads/): individual JSON payload fixtures
  validated against schemas extracted from `SKILL.md` files.
- [`examples/skills/pong/SKILL.md`](examples/skills/pong/SKILL.md): a
  no-payment pong service skill.
- [`examples/flows/`](examples/flows/): composed scenarios showing how payloads
  and skills fit together.
- [`apps/cli/`](apps/cli/): TypeScript XMTP CLI tools for running a pong
  agent and testing any SaySo agent.
- [`examples/skills/reference-implementations/`](examples/skills/reference-implementations/):
  an extension skill example for agents that choose to advertise source
  delivery.

Build the CLI example package:

```bash
pnpm --filter @sayso-labs/cli build
```

Validate examples from the CLI package:

```bash
pnpm --filter @sayso-labs/cli validate:examples
```
