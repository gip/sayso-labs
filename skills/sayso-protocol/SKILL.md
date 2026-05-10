---
name: sayso-protocol
description: Mandatory SaySo meta protocol for connection, skill discovery, disconnect, and core protocol errors.
---

# SaySo Protocol

Version: **0.1.0**.

SaySo is a meta protocol for agents and humans built on crypto-native security
and identity, XMTP secure communication, and optional extension skills such as
payments. Every SaySo-compatible agent must support this skill.

The mandatory protocol standardizes only:

1. How to connect and learn the current SaySo protocol version.
2. How to discover the skills an agent supports.
3. How to disconnect from an agent, optionally requesting data deletion.
4. How to report core protocol errors.

Everything else - services, payments, identity proofs, role models, schemas,
reference implementations, rate limits, and lifecycle rules - is described by
separate skills returned through skill discovery.

Per-conversation protocol upgrades are also optional. Agents or clients that
support them advertise `sayso.upgrade` as a separate skill. `sayso.protocol`
v0.1.0 remains mandatory at startup for every SaySo-compatible agent, but an
accepted `sayso.upgrade` protocol handoff may make a non-SaySo protocol active
inside that specific conversation.

## Transport

SaySo protocol messages are XMTP messages. Core payloads are JSON encoded as
UTF-8 bytes and carried in custom XMTP content types.

## Core Content Types

All core content types use:

- `authorityId = "sayso.protocol"`
- `versionMinor = 0`
- `encoding = JSON as UTF-8 bytes`

| Family | Types |
|--------|-------|
| Connection | `agent-info/1`, `connection-request/1`, `connection-response/1` |
| Skill | `skill-request/1`, `skill-response/1` |
| Disconnect | `disconnect/1`, `forget-me/1`, `disconnect-ack/1` |
| Errors | `error/1` |

Schema anchors:

| Type | Schema |
|------|--------|
| `agent-info/1` | [schema](#schema-sayso-protocol-agent-info-1) |
| `connection-request/1` | [schema](#schema-sayso-protocol-connection-request-1) |
| `connection-response/1` | [schema](#schema-sayso-protocol-connection-response-1) |
| `skill-request/1` | [schema](#schema-sayso-protocol-skill-request-1) |
| `skill-response/1` | [schema](#schema-sayso-protocol-skill-response-1) |
| `disconnect/1` | [schema](#schema-sayso-protocol-disconnect-1) |
| `forget-me/1` | [schema](#schema-sayso-protocol-forget-me-1) |
| `disconnect-ack/1` | [schema](#schema-sayso-protocol-disconnect-ack-1) |
| `error/1` | [schema](#schema-sayso-protocol-error-1) |

The shorthand `sayso.protocol/connection-request/1` means:

```ts
{
  authorityId: "sayso.protocol",
  typeId: "connection-request",
  versionMajor: 1,
  versionMinor: 0
}
```

## Startup

When a new sender inbox or conversation connects, the agent must send
`agent-info/1` without waiting for an incoming SaySo message when the transport
exposes that event. If the transport cannot detect passive connection, the
agent must send `agent-info/1` before processing the first inbound message from
that sender or conversation.

`agent-info/1` includes the agent's current full skill packet and fallback text
similar to:

```text
This agent speaks SaySo. This message is sayso.protocol/agent-info/1, an XMTP custom content type carrying the current skill packet plus this fallback text. To connect or refresh skills, send an XMTP custom content type with authorityId="sayso.protocol", typeId="connection-request", versionMajor=1, versionMinor=0, encoded as UTF-8 JSON payload {} or a payload with skill-defined claim presentations. The agent will reply with sayso.protocol/connection-response/1 including protocolVersion, verifiedClaims when applicable, and the current skillPacket.
```

The required sequence is:

1. Caller contacts the agent sync inbox.
2. Agent sends `agent-info/1` with fallback text and the current full skill
   packet.
3. Caller may send `connection-request/1` with JSON payload `{}` or optional
   skill-defined `presentations` to connect, reconfirm, or refresh the current
   skill packet.
4. Agent replies with `connection-response/1`, including `protocolVersion`,
   optional `verifiedClaims`, and the current full `skillPacket`.
5. Caller may send `skill-request/1` later for explicit rediscovery, filtered
   skill requests, or compatibility.

Before connection, an agent must accept `connection-request/1` and should not
process `skill-request/1` or service-defined messages. `agent-info/1.skillPacket`
is authoritative for the initial skills it sends; `fallbackText` is for humans
or clients that can display but not decode the structured payload.

## Connection

Connection establishes protocol version visibility. It is not payment or
long-lived session negotiation. Authentication beyond the default XMTP sender
identity is optional and skill-defined.

### `connection-request/1`

```ts
type ConnectionRequestPayload = {
  presentations?: ClaimPresentation[];
};

type ClaimPresentation = {
  type: string;
  payload: Record<string, unknown>;
};

type VerifiedClaim = {
  type: string;
  subject?: Record<string, unknown>;
  status: "verified";
  verifiedAt: string;
  expiresAt?: string;
  issuer?: string;
  payload?: Record<string, unknown>;
};
```

### `agent-info/1`

```ts
type AgentInfoPayload = {
  protocolVersion: string;
  supportedProtocolVersions: string[];
  agent: {
    agentId: string;
    syncInboxId: string;
    displayName: string;
  };
  fallbackText: string;
  skillPacket: SkillPacket;
};
```

### `connection-response/1`

```ts
type ConnectionResponsePayload =
  | {
      status: "ok";
      protocolVersion: "0.1.0" | string;
      supportedProtocolVersions: string[];
      agent: {
        agentId: string;
        syncInboxId: string;
        displayName: string;
      };
      next: "sayso.protocol/skill-request/1" | string;
      skillPacket: SkillPacket;
      verifiedClaims?: VerifiedClaim[];
    }
  | {
      status: "error";
      supportedProtocolVersions?: string[];
      error: ProtocolError;
    };
```

Rules:

- `connection-request/1` may be `{}` or may include optional `presentations`.
- Core SaySo does not define, require, or verify any specific claim type.
- Claim-specific semantics are defined by claim skills advertised through
  skill discovery.
- An agent MAY require advertised claim presentations, such as
  `sayso.claim.agent-connection`, before accepting a `connection-request/1`.
- If an agent receives an unsupported, malformed, or unverifiable claim
  presentation, it returns `connection-response/1` with `status = "error"` and
  does not establish the SaySo connection.
- `connection-response/1.protocolVersion` is the current SaySo protocol version
  selected by the agent.
- `connection-response/1.skillPacket` is the agent's current full skill packet
  and can be used to refresh skills without a separate `skill-request/1`.

## Skill Discovery

Structured skill packets are how callers learn what an agent supports. Callers
must not assume capabilities, channels, identity proofs, payment support,
roles, or schemas that are not present in `agent-info/1`,
`connection-response/1`, or `skill-response/1`.

### `skill-request/1`

```ts
type SkillRequestPayload = {
  include?: "resolved" | "skills" | "all";
  skillIds?: string[];
  maxDepth?: number;
};
```

`include` defaults to `"resolved"`:

- `"resolved"` asks for only the flattened executable contract.
- `"skills"` asks for separate referenced skills.
- `"all"` asks for both the flattened contract and referenced skills.

### Skill Contract Types

```ts
type AgentContentType = {
  authorityId: string;
  typeId: string;
  versionMajor: number;
  versionMinor?: number;
  purpose: string;
  channel?: string;
};

type AgentChannel = {
  channelId: string;
  kind: "sync" | "dm" | "group" | string;
  description: string;
  inboxId?: string;
  conversationId?: string;
  contentTypes?: string[];
};

type AgentCapability = {
  capabilityId: string;
  title: string;
  description: string;
  requestContentTypes: string[];
  responseContentTypes: string[];
  channels: string[];
  paymentPolicy: "none" | "required" | "optional" | string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  [extension: string]: unknown;
};

type AgentPaymentPolicy = {
  policyId: string;
  capabilityIds: string[];
  required: boolean;
  terms: Record<string, unknown>;
};

type AgentSkillContract = {
  capabilities: AgentCapability[];
  contentTypes: AgentContentType[];
  channels: AgentChannel[];
  paymentPolicies: AgentPaymentPolicy[];
  [extension: string]: unknown;
};

type SkillImport = {
  skillId: string;
  version: string;
  required?: boolean;
};

type SaySoSkillDocument = {
  skillId: string;
  name: string;
  version: string;
  kind: "meta" | "service" | "identity" | "payment" | "extension" | string;
  imports: SkillImport[];
  skill: AgentSkillContract;
  content: string;
  mediaType: string;
};

type SkillResolution = {
  mode: "resolved" | "skills" | "all";
  requestedSkillIds?: string[];
  includedSkillIds: string[];
  dependencyOrder: string[];
};

type SkillPacket = {
  agent: {
    agentId: string;
    kind: string;
    syncInboxId: string;
    displayName: string;
    protocolVersion: string;
  };
  skill: AgentSkillContract;
  skills: SaySoSkillDocument[];
  resolution: SkillResolution;
  content: string;
  mediaType: string;
};
```

### `skill-response/1`

```ts
type SkillResponsePayload =
  | {
      status: "ok";
      agent: {
        agentId: string;
        kind: string;
        syncInboxId: string;
        displayName: string;
        protocolVersion: string;
      };
      skill: AgentSkillContract;
      skills?: SaySoSkillDocument[];
      resolution?: SkillResolution;
      content: string;
      mediaType: string;
    }
  | {
      status: "error";
      error: ProtocolError;
    };
```

Rules:

- `skill` is the flattened resolved contract. Simple clients can ignore
  `skills` and use `skill` directly.
- `skills` contains referenced skill documents for composable clients.
- `sayso.protocol` is mandatory for every SaySo agent.
- Optional features, including payments, are separate skills.
- The resolved `skill` is a deterministic merge of selected compatible skills.
- Duplicate capability ids, channel ids, payment policy ids, or incompatible
  content type definitions make the skill bundle invalid.
- A non-`none` `paymentPolicy` requires an advertised payment skill such as
  `sayso.payment`.

## Disconnect

### `disconnect/1`

```ts
type DisconnectPayload = {
  reason?: string;
};
```

### `forget-me/1`

```ts
type ForgetMePayload = {
  reason?: string;
};
```

### `disconnect-ack/1`

```ts
type DisconnectAckPayload = {
  action: "disconnect" | "forget-me";
  status: "ok" | "partial" | "error";
  details?: Record<string, unknown>;
  error?: ProtocolError;
};
```

Rules:

- An agent must accept `disconnect/1` and `forget-me/1` from any sender it has
  previously interacted with.
- `forget-me/1` does not guarantee complete erasure. The agent must report in
  `details` what was deleted and what was retained.

## Errors

### `error/1`

```ts
type ProtocolError = {
  code:
    | "unknown-type"
    | "malformed"
    | "request-expired"
    | "not-supported"
    | "not-connected"
    | "presentation-unsupported"
    | "presentation-malformed"
    | "presentation-verification-failed"
    | "conflict"
    | "internal";
  message: string;
};

type ErrorPayload = ProtocolError & {
  requestId?: string;
};
```

Skill-defined errors are reported using skill-defined content types. Core
`error/1` is reserved for failures of the mandatory protocol envelope itself.

## Versioning

Breaking wire-shape changes to core content types bump their major content
type version. Additive core fields use new minor versions. Skill-defined
content types version independently.

## Schemata

The following JSON Schema blocks are part of this skill document. They are the exact wire payload contracts for the content types or claim presentations above.

<a id="schema-sayso-protocol-common"></a>

### Schema: `sayso://sayso.protocol/common`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.protocol/common",
  "title": "SaySo common schema definitions",
  "$defs": {
    "protocolError": {
      "type": "object",
      "required": [
        "code",
        "message"
      ],
      "additionalProperties": false,
      "properties": {
        "code": {
          "type": "string",
          "enum": [
            "unknown-type",
            "malformed",
            "request-expired",
            "not-supported",
            "not-connected",
            "presentation-unsupported",
            "presentation-malformed",
            "presentation-verification-failed",
            "conflict",
            "internal"
          ]
        },
        "message": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "agentInfo": {
      "type": "object",
      "required": [
        "agentId",
        "syncInboxId",
        "displayName"
      ],
      "additionalProperties": false,
      "properties": {
        "agentId": {
          "type": "string",
          "minLength": 1
        },
        "syncInboxId": {
          "type": "string",
          "minLength": 1
        },
        "displayName": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "claimPresentation": {
      "type": "object",
      "required": [
        "type",
        "payload"
      ],
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "minLength": 1
        },
        "payload": {
          "type": "object",
          "additionalProperties": true
        }
      }
    },
    "verifiedClaim": {
      "type": "object",
      "required": [
        "type",
        "status",
        "verifiedAt"
      ],
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "minLength": 1
        },
        "subject": {
          "type": "object",
          "additionalProperties": true
        },
        "status": {
          "const": "verified"
        },
        "verifiedAt": {
          "type": "string",
          "minLength": 1
        },
        "expiresAt": {
          "type": "string",
          "minLength": 1
        },
        "issuer": {
          "type": "string",
          "minLength": 1
        },
        "payload": {
          "type": "object",
          "additionalProperties": true
        }
      }
    },
    "agentContentType": {
      "type": "object",
      "required": [
        "authorityId",
        "typeId",
        "versionMajor",
        "purpose"
      ],
      "additionalProperties": false,
      "properties": {
        "authorityId": {
          "type": "string",
          "minLength": 1
        },
        "typeId": {
          "type": "string",
          "minLength": 1
        },
        "versionMajor": {
          "type": "integer",
          "minimum": 1
        },
        "versionMinor": {
          "type": "integer",
          "minimum": 0
        },
        "purpose": {
          "type": "string",
          "minLength": 1
        },
        "channel": {
          "type": "string"
        }
      }
    },
    "agentChannel": {
      "type": "object",
      "required": [
        "channelId",
        "kind",
        "description"
      ],
      "additionalProperties": false,
      "properties": {
        "channelId": {
          "type": "string",
          "minLength": 1
        },
        "kind": {
          "type": "string",
          "minLength": 1
        },
        "description": {
          "type": "string",
          "minLength": 1
        },
        "inboxId": {
          "type": "string"
        },
        "conversationId": {
          "type": "string"
        },
        "contentTypes": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "uniqueItems": true
        }
      }
    },
    "agentCapability": {
      "type": "object",
      "required": [
        "capabilityId",
        "title",
        "description",
        "requestContentTypes",
        "responseContentTypes",
        "channels",
        "paymentPolicy"
      ],
      "additionalProperties": true,
      "properties": {
        "capabilityId": {
          "type": "string",
          "minLength": 1
        },
        "title": {
          "type": "string",
          "minLength": 1
        },
        "description": {
          "type": "string",
          "minLength": 1
        },
        "requestContentTypes": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "uniqueItems": true
        },
        "responseContentTypes": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "uniqueItems": true
        },
        "channels": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "uniqueItems": true
        },
        "paymentPolicy": {
          "type": "string",
          "minLength": 1
        },
        "inputSchema": {
          "type": "object",
          "additionalProperties": true
        },
        "outputSchema": {
          "type": "object",
          "additionalProperties": true
        }
      }
    },
    "agentPaymentPolicy": {
      "type": "object",
      "required": [
        "policyId",
        "capabilityIds",
        "required",
        "terms"
      ],
      "additionalProperties": false,
      "properties": {
        "policyId": {
          "type": "string",
          "minLength": 1
        },
        "capabilityIds": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "uniqueItems": true
        },
        "required": {
          "type": "boolean"
        },
        "terms": {
          "type": "object",
          "additionalProperties": true
        }
      }
    },
    "agentSkillContract": {
      "type": "object",
      "required": [
        "capabilities",
        "contentTypes",
        "channels",
        "paymentPolicies"
      ],
      "additionalProperties": true,
      "properties": {
        "capabilities": {
          "type": "array",
          "items": {
            "$ref": "sayso://sayso.protocol/common#/$defs/agentCapability"
          }
        },
        "contentTypes": {
          "type": "array",
          "items": {
            "$ref": "sayso://sayso.protocol/common#/$defs/agentContentType"
          }
        },
        "channels": {
          "type": "array",
          "items": {
            "$ref": "sayso://sayso.protocol/common#/$defs/agentChannel"
          }
        },
        "paymentPolicies": {
          "type": "array",
          "items": {
            "$ref": "sayso://sayso.protocol/common#/$defs/agentPaymentPolicy"
          }
        }
      }
    },
    "skillImport": {
      "type": "object",
      "required": [
        "skillId",
        "version"
      ],
      "additionalProperties": false,
      "properties": {
        "skillId": {
          "type": "string",
          "minLength": 1
        },
        "version": {
          "type": "string",
          "minLength": 1
        },
        "required": {
          "type": "boolean"
        }
      }
    },
    "saysoSkillDocument": {
      "type": "object",
      "required": [
        "skillId",
        "name",
        "version",
        "kind",
        "imports",
        "skill",
        "content",
        "mediaType"
      ],
      "additionalProperties": false,
      "properties": {
        "skillId": {
          "type": "string",
          "minLength": 1
        },
        "name": {
          "type": "string",
          "minLength": 1
        },
        "version": {
          "type": "string",
          "minLength": 1
        },
        "kind": {
          "type": "string",
          "minLength": 1
        },
        "imports": {
          "type": "array",
          "items": {
            "$ref": "sayso://sayso.protocol/common#/$defs/skillImport"
          }
        },
        "skill": {
          "$ref": "sayso://sayso.protocol/common#/$defs/agentSkillContract"
        },
        "content": {
          "type": "string"
        },
        "mediaType": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "skillResolution": {
      "type": "object",
      "required": [
        "mode",
        "includedSkillIds",
        "dependencyOrder"
      ],
      "additionalProperties": false,
      "properties": {
        "mode": {
          "enum": [
            "resolved",
            "skills",
            "all"
          ]
        },
        "requestedSkillIds": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "uniqueItems": true
        },
        "includedSkillIds": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "uniqueItems": true
        },
        "dependencyOrder": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "uniqueItems": true
        }
      }
    },
    "implementationDescriptor": {
      "type": "object",
      "required": [
        "implementationId",
        "implements",
        "language",
        "runtime",
        "entrypoint",
        "source",
        "sha256",
        "permissions"
      ],
      "additionalProperties": false,
      "properties": {
        "implementationId": {
          "type": "string",
          "minLength": 1
        },
        "implements": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "uniqueItems": true
        },
        "language": {
          "type": "string",
          "minLength": 1
        },
        "runtime": {
          "type": "string",
          "minLength": 1
        },
        "entrypoint": {
          "type": "string",
          "minLength": 1
        },
        "source": {
          "type": "string"
        },
        "sha256": {
          "type": "string",
          "pattern": "^[a-f0-9]{64}$"
        },
        "permissions": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "uniqueItems": true
        },
        "signature": {
          "type": "string"
        }
      }
    },
    "skillPacketAgent": {
      "type": "object",
      "required": [
        "agentId",
        "kind",
        "syncInboxId",
        "displayName",
        "protocolVersion"
      ],
      "additionalProperties": false,
      "properties": {
        "agentId": {
          "type": "string",
          "minLength": 1
        },
        "kind": {
          "type": "string",
          "minLength": 1
        },
        "syncInboxId": {
          "type": "string",
          "minLength": 1
        },
        "displayName": {
          "type": "string",
          "minLength": 1
        },
        "protocolVersion": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "skillPacket": {
      "type": "object",
      "required": [
        "agent",
        "skill",
        "skills",
        "resolution",
        "content",
        "mediaType"
      ],
      "additionalProperties": false,
      "properties": {
        "agent": {
          "$ref": "sayso://sayso.protocol/common#/$defs/skillPacketAgent"
        },
        "skill": {
          "$ref": "sayso://sayso.protocol/common#/$defs/agentSkillContract"
        },
        "skills": {
          "type": "array",
          "items": {
            "$ref": "sayso://sayso.protocol/common#/$defs/saysoSkillDocument"
          }
        },
        "resolution": {
          "$ref": "sayso://sayso.protocol/common#/$defs/skillResolution"
        },
        "content": {
          "type": "string"
        },
        "mediaType": {
          "type": "string",
          "minLength": 1
        }
      }
    }
  }
}
```

<a id="schema-sayso-protocol-agent-info-1"></a>

### Schema: `sayso.protocol/agent-info/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.protocol/agent-info/1",
  "title": "SaySo agent-info/1 payload",
  "x-sayso-authority": "sayso.protocol",
  "x-sayso-content-type": {
    "authorityId": "sayso.protocol",
    "typeId": "agent-info",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "type": "object",
  "required": [
    "protocolVersion",
    "supportedProtocolVersions",
    "agent",
    "fallbackText",
    "skillPacket"
  ],
  "additionalProperties": false,
  "properties": {
    "protocolVersion": {
      "type": "string",
      "minLength": 1
    },
    "supportedProtocolVersions": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "uniqueItems": true
    },
    "agent": {
      "$ref": "sayso://sayso.protocol/common#/$defs/agentInfo"
    },
    "fallbackText": {
      "type": "string",
      "minLength": 1
    },
    "skillPacket": {
      "$ref": "sayso://sayso.protocol/common#/$defs/skillPacket"
    }
  }
}
```

<a id="schema-sayso-protocol-connection-request-1"></a>

### Schema: `sayso.protocol/connection-request/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.protocol/connection-request/1",
  "title": "SaySo connection-request/1 payload",
  "x-sayso-authority": "sayso.protocol",
  "x-sayso-content-type": {
    "authorityId": "sayso.protocol",
    "typeId": "connection-request",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "presentations": {
      "type": "array",
      "items": {
        "$ref": "sayso://sayso.protocol/common#/$defs/claimPresentation"
      }
    }
  }
}
```

<a id="schema-sayso-protocol-connection-response-1"></a>

### Schema: `sayso.protocol/connection-response/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.protocol/connection-response/1",
  "title": "SaySo connection-response/1 payload",
  "x-sayso-authority": "sayso.protocol",
  "x-sayso-content-type": {
    "authorityId": "sayso.protocol",
    "typeId": "connection-response",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "oneOf": [
    {
      "type": "object",
      "required": [
        "status",
        "protocolVersion",
        "supportedProtocolVersions",
        "agent",
        "next",
        "skillPacket"
      ],
      "additionalProperties": false,
      "properties": {
        "status": {
          "const": "ok"
        },
        "protocolVersion": {
          "type": "string",
          "minLength": 1
        },
        "supportedProtocolVersions": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "uniqueItems": true
        },
        "agent": {
          "$ref": "sayso://sayso.protocol/common#/$defs/agentInfo"
        },
        "next": {
          "type": "string",
          "minLength": 1
        },
        "skillPacket": {
          "$ref": "sayso://sayso.protocol/common#/$defs/skillPacket"
        },
        "verifiedClaims": {
          "type": "array",
          "items": {
            "$ref": "sayso://sayso.protocol/common#/$defs/verifiedClaim"
          }
        }
      }
    },
    {
      "type": "object",
      "required": [
        "status",
        "error"
      ],
      "additionalProperties": false,
      "properties": {
        "status": {
          "const": "error"
        },
        "supportedProtocolVersions": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "uniqueItems": true
        },
        "error": {
          "$ref": "sayso://sayso.protocol/common#/$defs/protocolError"
        }
      }
    }
  ]
}
```

<a id="schema-sayso-protocol-disconnect-ack-1"></a>

### Schema: `sayso.protocol/disconnect-ack/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.protocol/disconnect-ack/1",
  "title": "SaySo disconnect-ack/1 payload",
  "x-sayso-authority": "sayso.protocol",
  "x-sayso-content-type": {
    "authorityId": "sayso.protocol",
    "typeId": "disconnect-ack",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "type": "object",
  "required": [
    "action",
    "status"
  ],
  "additionalProperties": false,
  "properties": {
    "action": {
      "enum": [
        "disconnect",
        "forget-me"
      ]
    },
    "status": {
      "enum": [
        "ok",
        "partial",
        "error"
      ]
    },
    "details": {
      "type": "object",
      "additionalProperties": true
    },
    "error": {
      "$ref": "sayso://sayso.protocol/common#/$defs/protocolError"
    }
  }
}
```

<a id="schema-sayso-protocol-disconnect-1"></a>

### Schema: `sayso.protocol/disconnect/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.protocol/disconnect/1",
  "title": "SaySo disconnect/1 payload",
  "x-sayso-authority": "sayso.protocol",
  "x-sayso-content-type": {
    "authorityId": "sayso.protocol",
    "typeId": "disconnect",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "reason": {
      "type": "string"
    }
  }
}
```

<a id="schema-sayso-protocol-forget-me-1"></a>

### Schema: `sayso.protocol/forget-me/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.protocol/forget-me/1",
  "title": "SaySo forget-me/1 payload",
  "x-sayso-authority": "sayso.protocol",
  "x-sayso-content-type": {
    "authorityId": "sayso.protocol",
    "typeId": "forget-me",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "reason": {
      "type": "string"
    }
  }
}
```

<a id="schema-sayso-protocol-error-1"></a>

### Schema: `sayso.protocol/error/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.protocol/error/1",
  "title": "SaySo error/1 payload",
  "x-sayso-authority": "sayso.protocol",
  "x-sayso-content-type": {
    "authorityId": "sayso.protocol",
    "typeId": "error",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "type": "object",
  "required": [
    "code",
    "message"
  ],
  "additionalProperties": false,
  "properties": {
    "code": {
      "type": "string",
      "enum": [
        "unknown-type",
        "malformed",
        "request-expired",
        "not-supported",
        "not-connected",
        "presentation-unsupported",
        "presentation-malformed",
        "presentation-verification-failed",
        "conflict",
        "internal"
      ]
    },
    "message": {
      "type": "string",
      "minLength": 1
    },
    "requestId": {
      "type": "string"
    }
  }
}
```

<a id="schema-sayso-protocol-skill-request-1"></a>

### Schema: `sayso.protocol/skill-request/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.protocol/skill-request/1",
  "title": "SaySo skill-request/1 payload",
  "x-sayso-authority": "sayso.protocol",
  "x-sayso-content-type": {
    "authorityId": "sayso.protocol",
    "typeId": "skill-request",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "include": {
      "enum": [
        "resolved",
        "skills",
        "all"
      ]
    },
    "skillIds": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "uniqueItems": true
    },
    "maxDepth": {
      "type": "integer",
      "minimum": 0
    }
  }
}
```

<a id="schema-sayso-protocol-skill-response-1"></a>

### Schema: `sayso.protocol/skill-response/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.protocol/skill-response/1",
  "title": "SaySo skill-response/1 payload",
  "x-sayso-authority": "sayso.protocol",
  "x-sayso-content-type": {
    "authorityId": "sayso.protocol",
    "typeId": "skill-response",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "oneOf": [
    {
      "type": "object",
      "required": [
        "status",
        "agent",
        "skill",
        "content",
        "mediaType"
      ],
      "additionalProperties": false,
      "properties": {
        "status": {
          "const": "ok"
        },
        "agent": {
          "$ref": "sayso://sayso.protocol/common#/$defs/skillPacketAgent"
        },
        "skill": {
          "$ref": "sayso://sayso.protocol/common#/$defs/agentSkillContract"
        },
        "skills": {
          "type": "array",
          "items": {
            "$ref": "sayso://sayso.protocol/common#/$defs/saysoSkillDocument"
          }
        },
        "resolution": {
          "$ref": "sayso://sayso.protocol/common#/$defs/skillResolution"
        },
        "content": {
          "type": "string"
        },
        "mediaType": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    {
      "type": "object",
      "required": [
        "status",
        "error"
      ],
      "additionalProperties": false,
      "properties": {
        "status": {
          "const": "error"
        },
        "error": {
          "$ref": "sayso://sayso.protocol/common#/$defs/protocolError"
        }
      }
    }
  ]
}
```
