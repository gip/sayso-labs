---
name: sayso-upgrade
description: Optional SaySo meta extension for per-conversation skill bundle upgrades.
---

# SaySo Upgrade

Version: **0.1.0**.

This optional skill lets either side propose a per-conversation change to the
active protocol. A proposal can activate a replacement SaySo skill bundle or hand
the conversation to a non-SaySo protocol. A proposal explicitly declares which
current skills are kept, replaced, added, or removed.

Every SaySo-compatible agent must still support `sayso.protocol` v0.1.0 at startup.
An accepted protocol handoff changes only the current conversation; it does not
remove the agent's ability to accept a fresh SaySo connection later.

This skill imports:

- `sayso.protocol` version `^0.1.0`

## Content Types

All upgrade content types use:

- `authorityId = "sayso.upgrade"`
- `versionMinor = 0`
- `encoding = JSON as UTF-8 bytes`

| Type | Purpose | Schema |
|------|---------|--------|
| `upgrade-proposal/1` | Propose a replacement active skill bundle or protocol handoff. | [schema](#schema-sayso-upgrade-upgrade-proposal-1) |
| `upgrade-accept/1` | Accept a proposal and activate the target. | [schema](#schema-sayso-upgrade-upgrade-accept-1) |
| `upgrade-reject/1` | Reject a proposal and keep the current bundle. | [schema](#schema-sayso-upgrade-upgrade-reject-1) |

## Rules

- Upgrade negotiation starts only after `connection-response/1` and skill
  discovery.
- A side may use upgrade messages only when `sayso.upgrade` is present in the
  currently active skill bundle.
- Upgrade messages are interpreted using the currently active bundle until an
  `upgrade-accept/1` is processed.
- Agreement is per conversation.
- `targetMode = "sayso-bundle"` activates a complete replacement SaySo skill
  bundle, which must include `sayso.protocol`.
- `targetMode = "protocol-handoff"` hands the conversation to a non-SaySo
  protocol described by `handoffProtocol`.
- After accepting a protocol handoff, the next message in that conversation is
  governed entirely by the target protocol. There is no SaySo fallback in that
  conversation. To use SaySo again, start a fresh SaySo connection flow.

## Payloads

### `upgrade-proposal/1`

```ts
type SkillChange = {
  skillId: string;
  operation: "keep" | "replace" | "add" | "remove";
  fromVersion?: string;
  toVersion?: string;
  reason?: string;
};

type HandoffProtocol = {
  protocolId: string;
  version: string;
  transport: string;
  entryContentTypes: string[];
  description?: string;
  specificationUri?: string;
};

type SaySoBundleUpgradeProposal = {
  proposalId: string;
  targetMode: "sayso-bundle";
  baseProtocolVersion: string;
  baseSkillIds: string[];
  skillChanges: SkillChange[];
  targetSkills: SaySoSkillDocument[];
  targetResolution?: SkillResolution;
  summary?: string;
  expiresAt?: string;
};

type ProtocolHandoffProposal = {
  proposalId: string;
  targetMode: "protocol-handoff";
  baseProtocolVersion: string;
  baseSkillIds: string[];
  skillChanges: SkillChange[];
  handoffProtocol: HandoffProtocol;
  targetSkills?: [];
  summary?: string;
  expiresAt?: string;
};

type UpgradeProposalPayload = SaySoBundleUpgradeProposal | ProtocolHandoffProposal;
```

Rules:

- For `targetMode = "sayso-bundle"`, `targetSkills` is the complete bundle that
  becomes active after acceptance.
- For `targetMode = "sayso-bundle"`, skills marked `keep` must appear in
  `targetSkills` unchanged, `replace` and `add` skills must appear in
  `targetSkills`, and `remove` skills must not appear in `targetSkills`.
- For `targetMode = "sayso-bundle"`, duplicate target skill ids or unresolved
  imports make the proposal invalid.
- For `targetMode = "protocol-handoff"`, `handoffProtocol` defines the target
  protocol and `targetSkills` must be omitted or empty.
- For `targetMode = "protocol-handoff"`, `skillChanges` declares how the
  current SaySo skills are retired for this conversation.

### `upgrade-accept/1`

```ts
type UpgradeAcceptPayload = {
  proposalId: string;
  acceptedAt: string;
};
```

When the non-proposing side sends `upgrade-accept/1`, the target becomes
active starting with the next message. For `sayso-bundle`, the next message is a
SaySo message governed by `targetSkills`. For `protocol-handoff`, the next
message is governed by `handoffProtocol`.

Alternate activation timing, such as activation after the current request
completes, requires a future version of `upgrade-accept`.

### `upgrade-reject/1`

```ts
type UpgradeRejectPayload = {
  proposalId: string;
  code: "unsupported" | "incompatible" | "expired" | "policy" | "malformed" | "other";
  reason: string;
};
```

If a proposal is rejected, expired, or malformed, the current bundle remains
active.

## Schemata

The following JSON Schema blocks are part of this skill document. They are the exact wire payload contracts for the content types or claim presentations above.

<a id="schema-sayso-upgrade-common"></a>

### Schema: `sayso://sayso.upgrade/common`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.upgrade/common",
  "title": "SaySo upgrades common schema definitions",
  "$defs": {
    "skillChange": {
      "type": "object",
      "required": [
        "skillId",
        "operation"
      ],
      "additionalProperties": false,
      "properties": {
        "skillId": {
          "type": "string",
          "minLength": 1
        },
        "operation": {
          "enum": [
            "keep",
            "replace",
            "add",
            "remove"
          ]
        },
        "fromVersion": {
          "type": "string",
          "minLength": 1
        },
        "toVersion": {
          "type": "string",
          "minLength": 1
        },
        "reason": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "handoffProtocol": {
      "type": "object",
      "required": [
        "protocolId",
        "version",
        "transport",
        "entryContentTypes"
      ],
      "additionalProperties": false,
      "properties": {
        "protocolId": {
          "type": "string",
          "minLength": 1
        },
        "version": {
          "type": "string",
          "minLength": 1
        },
        "transport": {
          "type": "string",
          "minLength": 1
        },
        "entryContentTypes": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "string",
            "minLength": 1
          },
          "uniqueItems": true
        },
        "description": {
          "type": "string"
        },
        "specificationUri": {
          "type": "string"
        }
      }
    }
  }
}
```

<a id="schema-sayso-upgrade-upgrade-accept-1"></a>

### Schema: `sayso.upgrade/upgrade-accept/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.upgrade/upgrade-accept/1",
  "title": "SaySo upgrade-accept/1 payload",
  "x-sayso-authority": "sayso.upgrade",
  "x-sayso-content-type": {
    "authorityId": "sayso.upgrade",
    "typeId": "upgrade-accept",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "type": "object",
  "required": [
    "proposalId",
    "acceptedAt"
  ],
  "additionalProperties": false,
  "properties": {
    "proposalId": {
      "type": "string",
      "minLength": 1
    },
    "acceptedAt": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

<a id="schema-sayso-upgrade-upgrade-proposal-1"></a>

### Schema: `sayso.upgrade/upgrade-proposal/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.upgrade/upgrade-proposal/1",
  "title": "SaySo upgrade-proposal/1 payload",
  "x-sayso-authority": "sayso.upgrade",
  "x-sayso-content-type": {
    "authorityId": "sayso.upgrade",
    "typeId": "upgrade-proposal",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "oneOf": [
    {
      "type": "object",
      "required": [
        "proposalId",
        "targetMode",
        "baseProtocolVersion",
        "baseSkillIds",
        "skillChanges",
        "targetSkills"
      ],
      "additionalProperties": false,
      "properties": {
        "proposalId": {
          "type": "string",
          "minLength": 1
        },
        "targetMode": {
          "const": "sayso-bundle"
        },
        "baseProtocolVersion": {
          "type": "string",
          "minLength": 1
        },
        "baseSkillIds": {
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1
          },
          "uniqueItems": true
        },
        "skillChanges": {
          "type": "array",
          "minItems": 1,
          "items": {
            "$ref": "sayso://sayso.upgrade/common#/$defs/skillChange"
          }
        },
        "targetSkills": {
          "type": "array",
          "minItems": 1,
          "items": {
            "$ref": "sayso://sayso.protocol/common#/$defs/saysoSkillDocument"
          }
        },
        "targetResolution": {
          "$ref": "sayso://sayso.protocol/common#/$defs/skillResolution"
        },
        "summary": {
          "type": "string"
        },
        "expiresAt": {
          "type": "string"
        }
      }
    },
    {
      "type": "object",
      "required": [
        "proposalId",
        "targetMode",
        "baseProtocolVersion",
        "baseSkillIds",
        "skillChanges",
        "handoffProtocol"
      ],
      "additionalProperties": false,
      "properties": {
        "proposalId": {
          "type": "string",
          "minLength": 1
        },
        "targetMode": {
          "const": "protocol-handoff"
        },
        "baseProtocolVersion": {
          "type": "string",
          "minLength": 1
        },
        "baseSkillIds": {
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1
          },
          "uniqueItems": true
        },
        "skillChanges": {
          "type": "array",
          "minItems": 1,
          "items": {
            "$ref": "sayso://sayso.upgrade/common#/$defs/skillChange"
          }
        },
        "targetSkills": {
          "type": "array",
          "maxItems": 0,
          "items": {
            "$ref": "sayso://sayso.protocol/common#/$defs/saysoSkillDocument"
          }
        },
        "handoffProtocol": {
          "$ref": "sayso://sayso.upgrade/common#/$defs/handoffProtocol"
        },
        "summary": {
          "type": "string"
        },
        "expiresAt": {
          "type": "string"
        }
      }
    }
  ]
}
```

<a id="schema-sayso-upgrade-upgrade-reject-1"></a>

### Schema: `sayso.upgrade/upgrade-reject/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.upgrade/upgrade-reject/1",
  "title": "SaySo upgrade-reject/1 payload",
  "x-sayso-authority": "sayso.upgrade",
  "x-sayso-content-type": {
    "authorityId": "sayso.upgrade",
    "typeId": "upgrade-reject",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "type": "object",
  "required": [
    "proposalId",
    "code",
    "reason"
  ],
  "additionalProperties": false,
  "properties": {
    "proposalId": {
      "type": "string",
      "minLength": 1
    },
    "code": {
      "enum": [
        "unsupported",
        "incompatible",
        "expired",
        "policy",
        "malformed",
        "other"
      ]
    },
    "reason": {
      "type": "string",
      "minLength": 1
    }
  }
}
```
