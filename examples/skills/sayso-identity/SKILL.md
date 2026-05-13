---
name: sayso-identity
description: Reference-implementation skill for hierarchical-deterministic SaySo identities and agent disclosure payloads.
---

# SaySo Identity

Version: **0.1.0**.

This skill is **part of the SaySo Labs reference implementation, not the
canonical SaySo protocol**. It describes how the reference apps (the network
explorer, the CLI, the personal service) model a user's wallet as a
**hierarchical-deterministic identity** with multiple **derived agents**, and
the disclosure payload they MAY send to a peer to advertise that structure.

Protocol-level proof of address control is provided by the canonical
[`sayso.claim`](../../../skills/sayso-claim/SKILL.md) skill
(`sayso.claim.wallet-control`). This skill adds an organizational view on top
of that proof; it does not replace it. An agent that never adopts this skill
can still participate in SaySo identity flows by sending `wallet-control`
presentations directly.

Other implementations are free to use different key topologies (smart-account
wallets, MPC, hardware-rooted keys, random independent per-agent keys, etc.)
and remain fully interoperable on the wire — the canonical `sayso.claim`
skill is what peers verify against. This document records the choices the
reference implementation makes so that other reference-implementation hosts
can reproduce identical addresses from the same mnemonic.

This skill imports:

- `sayso.protocol` version `^0.1.0`
- `sayso.claim` version `^0.1.0` (for ownership proofs)

## Skill Metadata

- `skillId = "sayso.identity"`
- `kind = "identity"`
- supported connection presentation types:
  - `sayso.identity.agent-roster` ([schema](#schema-sayso-identity-agent-roster))
- no custom XMTP content types

## Concepts

A conforming implementation models three levels:

- **Identity** — a top-level key tree rooted in a BIP-39 mnemonic. An Identity
  has a stable `identityHandle` (a hash of the master public key) and contains
  zero or more Agents. A user MAY hold many Identities. Identities MUST NOT be
  derived from each other; each Identity has its own mnemonic.

- **Agent** — a logical actor under an Identity, addressed by a non-negative
  integer `index`. An Agent has one derived keypair per supported chain at the
  same `index`. Index `0` is reserved for the Identity's default agent.

- **Address** — a chain-specific public address derived from the Identity's seed
  at the Agent's `index`. The set of chains and the exact derivation paths are
  fixed by this skill (see below) for v1.

The relationship is `Identity 1—n Agent 1—n Address (one per supported chain)`.

A user MAY prove that a set of derived addresses belong to the same Identity by
sending a `sayso.claim.wallet-control` presentation that lists those addresses
and includes a signature from each. A user MAY also choose to disclose part of
the Identity's structure (e.g. an agent roster) with the
`sayso.identity.agent-roster` presentation defined here. The skill does not
require disclosure; by default Agents are unlinkable on the wire.

## Mnemonic and Seed

- The Identity mnemonic MUST be a valid BIP-39 mnemonic of 12 or 24 words from
  the English wordlist.
- The mnemonic is converted to a 64-byte seed using BIP-39 (`PBKDF2-HMAC-SHA512`,
  2048 iterations, salt = `"mnemonic" + passphrase`). The passphrase MAY be
  empty; when non-empty it is part of the Identity (a different passphrase
  yields a different Identity).
- At-rest storage of mnemonics is implementation-defined. Hosts SHOULD encrypt
  mnemonics with a user-controlled passphrase using PBKDF2-SHA256 (≥ 600 000
  iterations) + AES-256-GCM, but the encrypted blob is never part of the wire
  protocol.

## Derivation Paths

Conforming implementations MUST use the following paths for v1. `n` is the
Agent index (a non-negative integer below 2^31).

| Chain | Curve | Derivation root | Path | Address format |
|---|---|---|---|---|
| Ethereum | secp256k1 | BIP-32 | `m/44'/60'/n'/0/0` | EIP-55 lower-cased `0x…` |
| Bitcoin | secp256k1 | BIP-32 | `m/84'/0'/n'/0/0` | bech32 P2WPKH (`bc1…`, BIP-173) |
| XRP Ledger | secp256k1 | BIP-32 | `m/44'/144'/n'/0/0` | classic r-address (base58, prefix `0x00`, double-SHA-256 checksum) |
| Stellar | ed25519 | SLIP-10 | `m/44'/148'/n'` | strkey G-address (SEP-23, version byte `6<<3`, CRC16-XModem checksum) |

Notes:

- Bitcoin v1 produces a single native segwit P2WPKH address per Agent. Future
  versions of this skill MAY add taproot (P2TR / bech32m) or other script types
  behind explicit opt-in.
- Stellar SLIP-10 derivation is **hardened-only**, per SEP-5. Non-hardened steps
  in the Stellar path MUST be rejected.
- XRP Ledger keys use the secp256k1 family rather than the native ed25519 family
  so that one BIP-32 root serves three chains. The classic r-address format is
  unaffected.

## Identity Handle

The `identityHandle` is a stable, public identifier derived as:

```
identityHandle = "sayso:identity:" + base32(sha256(masterPublicKeyCompressed)).slice(0, 26)
```

where `masterPublicKeyCompressed` is the BIP-32 master public key (depth = 0)
serialized as 33 bytes. The handle is safe to publish; it reveals nothing about
the mnemonic and does not on its own link sibling Agents.

The handle is the value carried in the `identityHandle` field of disclosure
payloads below. Verifiers MUST NOT treat presence of the same handle in two
presentations as proof that the same operator sent them — handles are
re-presentable. Use `sayso.claim.wallet-control` for proof of control.

## Agent Roster Presentation

`sayso.identity.agent-roster` discloses one or more Agents under a single
Identity. It is **not** a proof of control — it is a structured disclosure of
"these addresses share a master." A peer that requires proof MUST additionally
require a matching `sayso.claim.wallet-control` presentation listing the same
addresses.

```ts
type AgentRosterPresentation = {
  type: "sayso.identity.agent-roster";
  payload: {
    identityHandle: string;
    agents: Array<{
      index: number;
      label?: string;
      addresses: Array<{
        type: "ethereum" | "bitcoin" | "ripple" | "stellar";
        address: string;
        derivationPath: string;
      }>;
    }>;
    timestamp: string;
  };
};
```

Verifier expectations:

- `identityHandle` MUST be present and SHOULD match the `sayso:identity:` form
  above. Receivers MAY reject handles that do not match.
- `agents[]` MUST be non-empty. Each entry MUST have a unique `index`.
- `addresses[]` MUST be non-empty. Each entry's `derivationPath` MUST match the
  path table above for its `type` and the agent's `index`.
- `timestamp` is the freshness input. Acceptable clock skew and replay windows
  are verifier policy.
- This payload alone does not authorize anything; receivers MUST require an
  accompanying `sayso.claim.wallet-control` presentation to treat any listed
  address as controlled by the sender.

## Linkage With `sayso.claim`

To prove that the Agents in a roster are controlled by the sender, accompany
the roster with a `sayso.claim.wallet-control` presentation whose `wallets[]`
covers the same set of `(type, address)` pairs and whose `signatures[]`
includes a valid signature per wallet. The two presentations together establish
both **structure** (the roster) and **control** (the signatures).

A receiver that accepts both MAY include a `verifiedClaims[]` entry of type
`sayso.identity.agent-roster` with subject `{ identityHandle }` in its
`connection-response/1`. Receivers MUST NOT mark a roster as verified without
the accompanying `wallet-control` claim covering every listed address.

## Future Extensions (non-normative)

The following are explicitly out of scope for v1 and reserved as section
placeholders for later versions:

- `sayso.identity.derivation-proof` — cryptographic proof that two or more
  addresses share an HD master (xpub disclosure or zero-knowledge proof of
  derivation).
- Additional Bitcoin script types (P2TR, P2SH-P2WPKH).
- Additional chains (Solana, Cosmos families, Polkadot).
- Hardware-bound master keys (Secure Enclave, HSM).
- Per-Agent rotation of keys without changing `index`.

If a presentation is unsupported, malformed, or fails verification, the agent
returns `connection-response/1` with `status = "error"` and one of:

- `presentation-unsupported`
- `presentation-malformed`
- `presentation-verification-failed`

## Schemata

The following JSON Schema blocks are part of this skill document. They are the
exact wire payload contracts for the presentations above.

<a id="schema-sayso-identity-agent-roster"></a>

### Schema: `sayso.identity.agent-roster`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.identity/agent-roster",
  "title": "SaySo identity agent roster presentation",
  "x-sayso-claim-type": "sayso.identity.agent-roster",
  "type": "object",
  "required": [
    "type",
    "payload"
  ],
  "additionalProperties": false,
  "properties": {
    "type": {
      "const": "sayso.identity.agent-roster"
    },
    "payload": {
      "type": "object",
      "required": [
        "identityHandle",
        "agents",
        "timestamp"
      ],
      "additionalProperties": false,
      "properties": {
        "identityHandle": {
          "type": "string",
          "minLength": 1
        },
        "agents": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "required": [
              "index",
              "addresses"
            ],
            "additionalProperties": false,
            "properties": {
              "index": {
                "type": "integer",
                "minimum": 0
              },
              "label": {
                "type": "string",
                "minLength": 1
              },
              "addresses": {
                "type": "array",
                "minItems": 1,
                "items": {
                  "type": "object",
                  "required": [
                    "type",
                    "address",
                    "derivationPath"
                  ],
                  "additionalProperties": false,
                  "properties": {
                    "type": {
                      "enum": [
                        "ethereum",
                        "bitcoin",
                        "ripple",
                        "stellar"
                      ]
                    },
                    "address": {
                      "type": "string",
                      "minLength": 1
                    },
                    "derivationPath": {
                      "type": "string",
                      "minLength": 1
                    }
                  }
                }
              }
            }
          }
        },
        "timestamp": {
          "type": "string",
          "minLength": 1
        }
      }
    }
  }
}
```
