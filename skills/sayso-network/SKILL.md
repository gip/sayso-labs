---
name: sayso-network
description: Optional SaySo service protocol for the canonical SaySo Network registry agent.
---

# SaySo Network

Version: **0.1.0**.

`sayso.network` is the service protocol implemented by the canonical SaySo Network
registry agent. Any SaySo-compatible agent **SHOULD** register itself by
connecting over XMTP to the registry agent at Ethereum wallet address:

```txt
0xc9F639A95813C834967FB8a38f749eA5F0b5CdD9
```

Registration is recommended, but it is not required for SaySo compatibility. A
SaySo-compatible agent remains compatible if it supports `sayso.protocol` v0.1.0 at
startup.

Agents that require `sayso.claim.agent-connection` MAY forward those presentations
to SaySo Network by sending them in `sayso.protocol/connection-request/1`.
The registry verifies supported requester signatures and stores only aggregate
connection counts for registered agent wallet addresses.

The registry agent supports `sayso.protocol` v0.1.0 and this `sayso.network` skill.
It does not advertise `sayso.upgrade` in v0.1.0.

This skill imports:

- `sayso.protocol` version `^0.1.0`
- `sayso.payment` version `^0.1.0` when premium registration is enabled

## Content Types

All network content types use:

- `authorityId = "sayso.network"`
- `versionMinor = 0`
- `encoding = JSON as UTF-8 bytes`

| Type | Purpose | Schema |
|------|---------|--------|
| `registration-submit/1` | Register or update the sender's agent record. | [schema](#schema-sayso-network-registration-submit-1) |
| `premium-registration-submit/1` | Request a paid canonical-name registration. | [schema](#schema-sayso-network-premium-registration-submit-1) |
| `registration-result/1` | Report registration acceptance or rejection. | [schema](#schema-sayso-network-registration-result-1) |
| `registration-remove/1` | Remove the sender's agent record. | [schema](#schema-sayso-network-registration-remove-1) |
| `agent-query/1` | Search public registered agents. | [schema](#schema-sayso-network-agent-query-1) |
| `agent-query-response/1` | Return public matching agent records. | [schema](#schema-sayso-network-agent-query-response-1) |
| `agent-get/1` | Fetch one registered agent by id or sync inbox. | [schema](#schema-sayso-network-agent-get-1) |
| `agent-get-response/1` | Return one agent record or `not-found`. | [schema](#schema-sayso-network-agent-get-response-1) |

## Registration Flow

1. Agent connects to `0xc9F639A95813C834967FB8a38f749eA5F0b5CdD9` over XMTP.
2. Registry sends normal `sayso.protocol/agent-info/1`.
3. Agent may send `sayso.protocol/connection-request/1` with `{}`.
4. Agent sends `sayso.network/registration-submit/1`.
5. Registry verifies that the XMTP sender inbox matches
   `registration.agent.syncInboxId`.
6. Registry accepts, rejects, updates, or removes the registration.

Premium registration uses the same startup flow, then:

1. Agent sends `sayso.network/premium-registration-submit/1`.
2. Registry validates the requested canonical `registration.agent.agentId`.
3. Registry replies with `sayso.payment/payment-required/1`.
4. Agent sends `sayso.payment/payment-submit/1` for the same `requestId`.
5. Registry settles or rejects payment.
6. On settled payment, registry activates the premium registration and replies
   with `sayso.payment/payment-result/1` and `sayso.network/registration-result/1`.

## Source Capture

After accepting a registration, the registry MAY best-effort retrieve
implementation sources from the registering agent for registry display and
indexing. Source capture is only attempted when all of the following are true:

- The registration uses `profile.skillDisclosure = "include-skill-packet"`.
- The registration includes `profile.skillPacket`.
- The submitted skill packet advertises the canonical `sayso.source` skill.

When those conditions are met, the registry MAY send
`sayso.source/source-manifest-request/1` with `format = "files"` to the
registered `agent.syncInboxId`, then retrieve file chunks with
`sayso.source/source-chunk-request/1`. Registry implementations MUST verify
reported chunk hashes and final file hashes before storing or displaying source
bytes.

Source capture is not part of registration acceptance. Missing `sayso.source`,
capture timeouts, malformed source responses, policy errors, oversize
snapshots, or hash verification failures MUST NOT cause the accepted
registration to be rejected or removed. Registries MAY record source capture
status and MAY impose local size, file count, media type, or retention limits.

## Payloads

### `registration-submit/1`

```ts
type RegistrationSubmitPayload = {
  requestId: string;
  agent: {
    agentId: string;
    syncInboxId: string;
    displayName: string;
    protocolVersion: string;
  };
  visibility: "private" | "public";
  profile?: {
    description?: string;
    skillDisclosure: "summary-only" | "include-skill-packet";
    skillPacket?: SkillPacket;
  };
  expiresAt?: string;
  extensions?: Record<string, unknown>;
};
```

Rules:

- `visibility = "private"` means stored but unlisted.
- `visibility = "public"` requires `profile.description`.
- `skillDisclosure = "summary-only"` exposes metadata and description only.
- `skillDisclosure = "include-skill-packet"` requires `profile.skillPacket` and
  allows discovery responses to include it.

### `premium-registration-submit/1`

```ts
type PremiumRegistrationSubmitPayload = {
  requestId: string;
  agent: {
    agentId: string;
    syncInboxId: string;
    displayName: string;
    protocolVersion: string;
  };
  visibility: "public";
  profile: {
    description: string;
    skillDisclosure: "summary-only" | "include-skill-packet";
    skillPacket?: SkillPacket;
  };
  extensions?: Record<string, unknown>;
};
```

Rules:

- Premium registration is public-only and does not accept caller-supplied
  `expiresAt`.
- `agent.agentId` is the paid canonical name. It must be a lowercase slug:
  3-63 characters, letters, digits, and hyphens only, starting and ending with a
  letter or digit, and not starting with `0x`.
- The canonical name is globally reserved by the first settled payment while the
  premium registration is active.
- The same sender inbox may renew an active premium registration.
- Payment uses `sayso.payment` with the same `requestId`; the registry performs
  the paid registration only after `payment-result/1` reaches `status =
  "settled"`.
- `payment-required/1.accepts` may contain one or more exact payment
  requirements. Each requirement names an independent payment rail with its
  `network`, `asset`, `amount`, `payTo`, timeout, and metadata.
- Clients choose one advertised payment requirement and echo that exact
  requirement in `payment-submit/1.payment.accepted`.
- Multi-rail premium registration is allowed when the registry verifier can
  settle each advertised rail, including combinations such as Base, World
  Chain, XRPL, or Stellar payments in USDC or RLUSD.

### `registration-result/1`

```ts
type RegistrationResultPayload =
  | {
      requestId: string;
      status: "accepted";
      registrationId: string;
      visibility: "private" | "public";
      updatedAt: string;
    }
  | {
      requestId: string;
      status: "rejected";
      error: {
        code: "sender-mismatch" | "malformed" | "unsupported" | "policy" | "internal";
        message: string;
      };
    };
```

### `registration-remove/1`

```ts
type RegistrationRemovePayload = {
  requestId: string;
  agentId?: string;
  syncInboxId?: string;
};
```

The registry must only remove registrations owned by the sender inbox.

### `agent-query/1`

```ts
type AgentQueryPayload = {
  requestId: string;
  query?: string;
  skillIds?: string[];
  capabilityIds?: string[];
  limit?: number;
  cursor?: string;
};
```

`agent-query/1` searches public registrations. It never returns private
registrations.

### `agent-query-response/1`

```ts
type AgentQueryResponsePayload = {
  requestId: string;
  results: NetworkAgentRecord[];
  nextCursor?: string;
};
```

### `agent-get/1`

```ts
type AgentGetPayload = {
  requestId: string;
  agentId?: string;
  syncInboxId?: string;
};
```

### `agent-get-response/1`

```ts
type AgentGetResponsePayload =
  | {
      requestId: string;
      status: "found";
      result: NetworkAgentRecord;
    }
  | {
      requestId: string;
      status: "not-found";
    };
```

`agent-get/1` returns public records to any caller. It may return a private
record only to the same sender inbox that registered it.

### Shared Record

```ts
type NetworkAgentRecord = {
  registrationId: string;
  walletAddress: string;
  agent: {
    agentId: string;
    syncInboxId: string;
    displayName: string;
    protocolVersion: string;
  };
  visibility: "public" | "private";
  listingTier: "standard" | "premium";
  description: string;
  skillDisclosure: "summary-only" | "include-skill-packet";
  claimTypes: string[];
  connectionCount: number;
  skillPacket?: SkillPacket;
  updatedAt: string;
  expiresAt?: string;
  premiumExpiresAt?: string;
};
```

Rules:

- Query responses only return records with `visibility = "public"`.
- Active premium records use `listingTier = "premium"` and sort before standard
  records in discovery.
- Summary-only records must not include `skillPacket`.
- Records with `skillDisclosure = "include-skill-packet"` include `skillPacket`
  when returned.
- `connectionCount` is the count of unique verified
  `sayso.claim.agent-connection` requester wallets for the registered agent
  wallet address.
- Supported presentations are advertised through the submitted skill packet when
  `skillDisclosure = "include-skill-packet"`, for example by including
  `sayso.claim`.

## Schemata

The following JSON Schema blocks are part of this skill document. They are the exact wire payload contracts for the content types or claim presentations above.

<a id="schema-sayso-network-common"></a>

### Schema: `sayso://sayso.network/common`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.network/common",
  "title": "SaySo network common schema definitions",
  "$defs": {
    "networkAgent": {
      "type": "object",
      "required": [
        "agentId",
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
    "premiumNetworkAgent": {
      "type": "object",
      "required": [
        "agentId",
        "syncInboxId",
        "displayName",
        "protocolVersion"
      ],
      "additionalProperties": false,
      "properties": {
        "agentId": {
          "type": "string",
          "pattern": "^(?!0x)[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$"
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
    "summaryOnlyProfile": {
      "type": "object",
      "required": [
        "description",
        "skillDisclosure"
      ],
      "additionalProperties": false,
      "properties": {
        "description": {
          "type": "string",
          "minLength": 1
        },
        "skillDisclosure": {
          "const": "summary-only"
        }
      }
    },
    "skillPacketProfile": {
      "type": "object",
      "required": [
        "description",
        "skillDisclosure",
        "skillPacket"
      ],
      "additionalProperties": false,
      "properties": {
        "description": {
          "type": "string",
          "minLength": 1
        },
        "skillDisclosure": {
          "const": "include-skill-packet"
        },
        "skillPacket": {
          "$ref": "sayso://sayso.protocol/common#/$defs/skillPacket"
        }
      }
    },
    "privateProfile": {
      "oneOf": [
        {
          "$ref": "sayso://sayso.network/common#/$defs/summaryOnlyProfile"
        },
        {
          "$ref": "sayso://sayso.network/common#/$defs/skillPacketProfile"
        }
      ]
    },
    "registrationError": {
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
            "sender-mismatch",
            "malformed",
            "unsupported",
            "policy",
            "internal"
          ]
        },
        "message": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "networkAgentRecord": {
      "type": "object",
      "required": [
        "registrationId",
        "walletAddress",
        "agent",
        "visibility",
        "listingTier",
        "description",
        "skillDisclosure",
        "claimTypes",
        "connectionCount",
        "updatedAt"
      ],
      "additionalProperties": false,
      "properties": {
        "registrationId": {
          "type": "string",
          "minLength": 1
        },
        "agent": {
          "$ref": "sayso://sayso.network/common#/$defs/networkAgent"
        },
        "walletAddress": {
          "type": "string"
        },
        "visibility": {
          "type": "string",
          "enum": [
            "private",
            "public"
          ]
        },
        "listingTier": {
          "type": "string",
          "enum": [
            "standard",
            "premium"
          ]
        },
        "description": {
          "type": "string",
          "minLength": 1
        },
        "skillDisclosure": {
          "type": "string",
          "enum": [
            "summary-only",
            "include-skill-packet"
          ]
        },
        "claimTypes": {
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1
          },
          "uniqueItems": true
        },
        "connectionCount": {
          "type": "integer",
          "minimum": 0
        },
        "skillPacket": {
          "$ref": "sayso://sayso.protocol/common#/$defs/skillPacket"
        },
        "updatedAt": {
          "type": "string",
          "minLength": 1
        },
        "expiresAt": {
          "type": "string",
          "minLength": 1
        },
        "premiumExpiresAt": {
          "type": "string",
          "minLength": 1
        }
      }
    }
  }
}
```

<a id="schema-sayso-network-agent-get-response-1"></a>

### Schema: `sayso.network/agent-get-response/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.network/agent-get-response/1",
  "title": "SaySo network agent-get-response/1 payload",
  "x-sayso-authority": "sayso.network",
  "x-sayso-content-type": {
    "authorityId": "sayso.network",
    "typeId": "agent-get-response",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "oneOf": [
    {
      "type": "object",
      "required": [
        "requestId",
        "status",
        "result"
      ],
      "additionalProperties": false,
      "properties": {
        "requestId": {
          "type": "string",
          "minLength": 1
        },
        "status": {
          "const": "found"
        },
        "result": {
          "$ref": "sayso://sayso.network/common#/$defs/networkAgentRecord"
        }
      }
    },
    {
      "type": "object",
      "required": [
        "requestId",
        "status"
      ],
      "additionalProperties": false,
      "properties": {
        "requestId": {
          "type": "string",
          "minLength": 1
        },
        "status": {
          "const": "not-found"
        }
      }
    }
  ]
}
```

<a id="schema-sayso-network-agent-get-1"></a>

### Schema: `sayso.network/agent-get/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.network/agent-get/1",
  "title": "SaySo network agent-get/1 payload",
  "x-sayso-authority": "sayso.network",
  "x-sayso-content-type": {
    "authorityId": "sayso.network",
    "typeId": "agent-get",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "type": "object",
  "required": [
    "requestId"
  ],
  "additionalProperties": false,
  "properties": {
    "requestId": {
      "type": "string",
      "minLength": 1
    },
    "agentId": {
      "type": "string",
      "minLength": 1
    },
    "syncInboxId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

<a id="schema-sayso-network-agent-query-response-1"></a>

### Schema: `sayso.network/agent-query-response/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.network/agent-query-response/1",
  "title": "SaySo network agent-query-response/1 payload",
  "x-sayso-authority": "sayso.network",
  "x-sayso-content-type": {
    "authorityId": "sayso.network",
    "typeId": "agent-query-response",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "type": "object",
  "required": [
    "requestId",
    "results"
  ],
  "additionalProperties": false,
  "properties": {
    "requestId": {
      "type": "string",
      "minLength": 1
    },
    "results": {
      "type": "array",
      "items": {
        "$ref": "sayso://sayso.network/common#/$defs/networkAgentRecord"
      }
    },
    "nextCursor": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

<a id="schema-sayso-network-agent-query-1"></a>

### Schema: `sayso.network/agent-query/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.network/agent-query/1",
  "title": "SaySo network agent-query/1 payload",
  "x-sayso-authority": "sayso.network",
  "x-sayso-content-type": {
    "authorityId": "sayso.network",
    "typeId": "agent-query",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "type": "object",
  "required": [
    "requestId"
  ],
  "additionalProperties": false,
  "properties": {
    "requestId": {
      "type": "string",
      "minLength": 1
    },
    "query": {
      "type": "string",
      "minLength": 1
    },
    "skillIds": {
      "type": "array",
      "items": {
        "type": "string",
        "minLength": 1
      },
      "uniqueItems": true
    },
    "capabilityIds": {
      "type": "array",
      "items": {
        "type": "string",
        "minLength": 1
      },
      "uniqueItems": true
    },
    "limit": {
      "type": "integer",
      "minimum": 1
    },
    "cursor": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

<a id="schema-sayso-network-premium-registration-submit-1"></a>

### Schema: `sayso.network/premium-registration-submit/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.network/premium-registration-submit/1",
  "title": "SaySo network premium-registration-submit/1 payload",
  "x-sayso-authority": "sayso.network",
  "x-sayso-content-type": {
    "authorityId": "sayso.network",
    "typeId": "premium-registration-submit",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "oneOf": [
    {
      "type": "object",
      "required": [
        "requestId",
        "agent",
        "visibility",
        "profile"
      ],
      "additionalProperties": false,
      "properties": {
        "requestId": {
          "type": "string",
          "minLength": 1
        },
        "agent": {
          "$ref": "sayso://sayso.network/common#/$defs/premiumNetworkAgent"
        },
        "visibility": {
          "const": "public"
        },
        "profile": {
          "$ref": "sayso://sayso.network/common#/$defs/summaryOnlyProfile"
        },
        "extensions": {
          "type": "object",
          "additionalProperties": true
        }
      }
    },
    {
      "type": "object",
      "required": [
        "requestId",
        "agent",
        "visibility",
        "profile"
      ],
      "additionalProperties": false,
      "properties": {
        "requestId": {
          "type": "string",
          "minLength": 1
        },
        "agent": {
          "$ref": "sayso://sayso.network/common#/$defs/premiumNetworkAgent"
        },
        "visibility": {
          "const": "public"
        },
        "profile": {
          "$ref": "sayso://sayso.network/common#/$defs/skillPacketProfile"
        },
        "extensions": {
          "type": "object",
          "additionalProperties": true
        }
      }
    }
  ]
}
```

<a id="schema-sayso-network-registration-remove-1"></a>

### Schema: `sayso.network/registration-remove/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.network/registration-remove/1",
  "title": "SaySo network registration-remove/1 payload",
  "x-sayso-authority": "sayso.network",
  "x-sayso-content-type": {
    "authorityId": "sayso.network",
    "typeId": "registration-remove",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "type": "object",
  "required": [
    "requestId"
  ],
  "additionalProperties": false,
  "properties": {
    "requestId": {
      "type": "string",
      "minLength": 1
    },
    "agentId": {
      "type": "string",
      "minLength": 1
    },
    "syncInboxId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

<a id="schema-sayso-network-registration-result-1"></a>

### Schema: `sayso.network/registration-result/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.network/registration-result/1",
  "title": "SaySo network registration-result/1 payload",
  "x-sayso-authority": "sayso.network",
  "x-sayso-content-type": {
    "authorityId": "sayso.network",
    "typeId": "registration-result",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "oneOf": [
    {
      "type": "object",
      "required": [
        "requestId",
        "status",
        "registrationId",
        "visibility",
        "updatedAt"
      ],
      "additionalProperties": false,
      "properties": {
        "requestId": {
          "type": "string",
          "minLength": 1
        },
        "status": {
          "const": "accepted"
        },
        "registrationId": {
          "type": "string",
          "minLength": 1
        },
        "visibility": {
          "type": "string",
          "enum": [
            "private",
            "public"
          ]
        },
        "updatedAt": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    {
      "type": "object",
      "required": [
        "requestId",
        "status",
        "error"
      ],
      "additionalProperties": false,
      "properties": {
        "requestId": {
          "type": "string",
          "minLength": 1
        },
        "status": {
          "const": "rejected"
        },
        "error": {
          "$ref": "sayso://sayso.network/common#/$defs/registrationError"
        }
      }
    }
  ]
}
```

<a id="schema-sayso-network-registration-submit-1"></a>

### Schema: `sayso.network/registration-submit/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.network/registration-submit/1",
  "title": "SaySo network registration-submit/1 payload",
  "x-sayso-authority": "sayso.network",
  "x-sayso-content-type": {
    "authorityId": "sayso.network",
    "typeId": "registration-submit",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "oneOf": [
    {
      "type": "object",
      "required": [
        "requestId",
        "agent",
        "visibility"
      ],
      "additionalProperties": false,
      "properties": {
        "requestId": {
          "type": "string",
          "minLength": 1
        },
        "agent": {
          "$ref": "sayso://sayso.network/common#/$defs/networkAgent"
        },
        "visibility": {
          "const": "private"
        },
        "profile": {
          "$ref": "sayso://sayso.network/common#/$defs/privateProfile"
        },
        "expiresAt": {
          "type": "string",
          "minLength": 1
        },
        "extensions": {
          "type": "object",
          "additionalProperties": true
        }
      }
    },
    {
      "type": "object",
      "required": [
        "requestId",
        "agent",
        "visibility",
        "profile"
      ],
      "additionalProperties": false,
      "properties": {
        "requestId": {
          "type": "string",
          "minLength": 1
        },
        "agent": {
          "$ref": "sayso://sayso.network/common#/$defs/networkAgent"
        },
        "visibility": {
          "const": "public"
        },
        "profile": {
          "$ref": "sayso://sayso.network/common#/$defs/summaryOnlyProfile"
        },
        "expiresAt": {
          "type": "string",
          "minLength": 1
        },
        "extensions": {
          "type": "object",
          "additionalProperties": true
        }
      }
    },
    {
      "type": "object",
      "required": [
        "requestId",
        "agent",
        "visibility",
        "profile"
      ],
      "additionalProperties": false,
      "properties": {
        "requestId": {
          "type": "string",
          "minLength": 1
        },
        "agent": {
          "$ref": "sayso://sayso.network/common#/$defs/networkAgent"
        },
        "visibility": {
          "const": "public"
        },
        "profile": {
          "$ref": "sayso://sayso.network/common#/$defs/skillPacketProfile"
        },
        "expiresAt": {
          "type": "string",
          "minLength": 1
        },
        "extensions": {
          "type": "object",
          "additionalProperties": true
        }
      }
    }
  ]
}
```
