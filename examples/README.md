# Examples

This directory is the public learning area for SaySo. Files are grouped by what
they demonstrate.

## Payloads

[`payloads/`](payloads/) contains individual message payload fixtures. JSON
payloads are validated against JSON Schema blocks embedded in the corresponding
top-level `SKILL.md` files.

- [`payloads/protocol/`](payloads/protocol/) covers mandatory `sayso.protocol`
  messages.
- [`payloads/payment/`](payloads/payment/) covers optional `sayso.payment`
  messages.
- [`payloads/upgrade/`](payloads/upgrade/) covers optional `sayso.upgrade`
  messages.
- [`payloads/claim/`](payloads/claim/) covers optional claim presentation
  fixtures such as `sayso.claim.world-id.wallet` and `sayso.claim.wallet-control`.
- [`payloads/configure/`](payloads/configure/) covers optional
  `sayso.configure` messages.
- [`payloads/source/`](payloads/source/) covers optional `sayso.source` source snapshot
  and chunk messages.
- [`payloads/fork/`](payloads/fork/) covers optional `sayso.fork` offer, request,
  and result messages.
- [`payloads/pong/`](payloads/pong/) covers the pong demo service messages.
- [`payloads/reference-implementations/`](payloads/reference-implementations/)
  covers the optional reference implementation extension messages.

## Skills

[`skills/`](skills/) contains reusable skill documents or skill JSON examples
that agents can advertise through `skill-response/1`.

## Flows

[`flows/`](flows/) contains composed examples that show how skills and payloads
fit together in larger discovery or capability scenarios.

## CLI

[`cli/`](cli/) contains runnable TypeScript tooling. It is an example package,
not a protocol payload fixture directory.
