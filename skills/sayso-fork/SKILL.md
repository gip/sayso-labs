---
name: sayso-fork
description: Optional SaySo skill for requesting time-limited agent forks.
---

# SaySo Fork

Version: **0.1.0**.

This optional skill lets a caller request a time-limited fork of an agent.
Forking is performed by infrastructure outside this protocol. The source agent
advertises fork offers, including duration and price when payment is required,
and later reports the result of the requested fork.

This skill imports:

- `sayso.protocol` version `^0.1.0`
- `sayso.configure` version `^0.1.0`
- `sayso.payment` version `^0.1.0` when any advertised fork offer requires
  payment

## Content Types

All fork content types use:

- `authorityId = "sayso.fork"`
- `versionMinor = 0`
- `encoding = JSON as UTF-8 bytes`

| Type | Purpose | Schema |
|------|---------|--------|
| `fork-offers-request/1` | Ask which fork offers are currently available. | [schema](#schema-sayso-fork-fork-offers-request-1) |
| `fork-offers-response/1` | Return available fork offers and duration/payment terms. | [schema](#schema-sayso-fork-fork-offers-response-1) |
| `fork-request/1` | Select an offer and supply fork-specific configuration values. | [schema](#schema-sayso-fork-fork-request-1) |
| `fork-result/1` | Report fork acceptance, rejection, endpoint, and validity window. | [schema](#schema-sayso-fork-fork-result-1) |

## Flow

1. Caller connects using `sayso.protocol`.
2. Caller uses `sayso.configure/configuration-request/1` to inspect public
   values and required private variable names.
3. Caller sends `sayso.fork/fork-offers-request/1`.
4. Agent replies with `sayso.fork/fork-offers-response/1`.
5. Caller sends `sayso.fork/fork-request/1` selecting an `offerId` and providing
   fork-specific configuration values for required private variables.
6. If the selected offer is free, the agent may reply directly with
   `sayso.fork/fork-result/1`.
7. If payment is required, the agent replies with
   `sayso.payment/payment-required/1`. The caller sends
   `sayso.payment/payment-submit/1` for the same `requestId`.
8. After settlement, the agent replies with `sayso.payment/payment-result/1` and
   `sayso.fork/fork-result/1`.

## Payloads

### `fork-offers-request/1`

```ts
type ForkOffersRequestPayload = {
  requestId: string;
  requestedDurationSeconds?: number;
  includePaymentRequirements?: boolean;
};
```

### `fork-offers-response/1`

```ts
type ForkProvider = {
  providerId: string;
  name?: string;
  kind?: string;
  region?: string;
  termsUri?: string;
};

type ForkOfferPayment = {
  required: boolean;
  x402Version?: number;
  accepts?: X402PaymentRequirements[];
};

type ForkOffer = {
  offerId: string;
  title?: string;
  description?: string;
  durationSeconds: number;
  expiresAt?: string;
  provider: ForkProvider;
  requiredConfiguration: string[];
  payment?: ForkOfferPayment;
};

type ForkOffersResponsePayload =
  | {
      requestId: string;
      status: "ok";
      offers: ForkOffer[];
      generatedAt?: string;
    }
  | {
      requestId: string;
      status: "error";
      error: {
        code: "malformed" | "policy" | "internal";
        message: string;
      };
    };
```

Rules:

- `durationSeconds` is the fork validity term offered by the source agent.
- `requiredConfiguration` names variables from `sayso.configure` that the caller
  must supply or confirm in `fork-request/1`.
- If `payment.required = true`, the agent must also advertise `sayso.payment` in
  the active skill bundle.
- `payment.accepts` describes acceptable payment rails for the offer. The
  authoritative payment requirement for a selected request is still
  `sayso.payment/payment-required/1`.

### `fork-request/1`

```ts
type ForkConfigurationValue =
  | null
  | boolean
  | number
  | string
  | ForkConfigurationValue[]
  | { [key: string]: ForkConfigurationValue };

type ForkConfigurationInput = {
  name: string;
  value: ForkConfigurationValue;
};

type ForkRequestPayload = {
  requestId: string;
  offerId: string;
  configuration?: ForkConfigurationInput[];
  requester?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
};
```

Rules:

- `configuration` supplies values for the fork only. It does not update the
  source agent.
- Private source-agent values are not copied or revealed by this protocol.
- Agents may reject a request when required configuration values are missing,
  malformed, or disallowed by provider policy.

### `fork-result/1`

```ts
type ForkedAgentEndpoint = {
  agentId?: string;
  syncInboxId?: string;
  displayName?: string;
  protocolVersion?: string;
  endpointUri?: string;
};

type ForkResultPayload =
  | {
      requestId: string;
      status: "accepted";
      forkId: string;
      offerId: string;
      provider: ForkProvider;
      validFrom: string;
      expiresAt: string;
      agent?: ForkedAgentEndpoint;
      extensions?: Record<string, unknown>;
    }
  | {
      requestId: string;
      status: "rejected";
      error: {
        code:
          | "malformed"
          | "unknown-offer"
          | "payment-required"
          | "payment-invalid"
          | "policy"
          | "internal";
        message: string;
      };
    };
```

Rules:

- `expiresAt` is determined by the selected offer duration and accepted payment
  terms.
- Agents should perform paid forks only after `sayso.payment/payment-result/1`
  reaches `status = "settled"` unless the fork offer explicitly accepts
  verified-but-unsettled payment risk.
- Fork validity is time-limited. After `expiresAt`, the forked endpoint may
  stop responding, require renewal, or report a provider-specific expiration
  state.
- The protocol describes the fork agreement and result. It does not standardize
  the provider's infrastructure API.

## Schemata

The following JSON Schema blocks are part of this skill document. They are the exact wire payload contracts for the content types or claim presentations above.

<a id="schema-sayso-fork-common"></a>

### Schema: `sayso://sayso.fork/common`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.fork/common",
  "title": "SaySo fork common schema definitions",
  "$defs": {
    "forkConfigurationValue": {
      "oneOf": [
        {
          "type": "null"
        },
        {
          "type": "boolean"
        },
        {
          "type": "number"
        },
        {
          "type": "string"
        },
        {
          "type": "array",
          "items": {
            "$ref": "sayso://sayso.fork/common#/$defs/forkConfigurationValue"
          }
        },
        {
          "type": "object",
          "additionalProperties": {
            "$ref": "sayso://sayso.fork/common#/$defs/forkConfigurationValue"
          }
        }
      ]
    },
    "forkConfigurationInput": {
      "type": "object",
      "required": [
        "name",
        "value"
      ],
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string",
          "minLength": 1
        },
        "value": {
          "$ref": "sayso://sayso.fork/common#/$defs/forkConfigurationValue"
        }
      }
    },
    "forkProvider": {
      "type": "object",
      "required": [
        "providerId"
      ],
      "additionalProperties": false,
      "properties": {
        "providerId": {
          "type": "string",
          "minLength": 1
        },
        "name": {
          "type": "string",
          "minLength": 1
        },
        "kind": {
          "type": "string",
          "minLength": 1
        },
        "region": {
          "type": "string",
          "minLength": 1
        },
        "termsUri": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "freeForkOfferPayment": {
      "type": "object",
      "required": [
        "required"
      ],
      "additionalProperties": false,
      "properties": {
        "required": {
          "const": false
        }
      }
    },
    "paidForkOfferPayment": {
      "type": "object",
      "required": [
        "required",
        "x402Version",
        "accepts"
      ],
      "additionalProperties": false,
      "properties": {
        "required": {
          "const": true
        },
        "x402Version": {
          "type": "integer",
          "minimum": 1
        },
        "accepts": {
          "type": "array",
          "minItems": 1,
          "items": {
            "$ref": "sayso://sayso.payment/common#/$defs/x402PaymentRequirements"
          }
        }
      }
    },
    "forkOfferPayment": {
      "oneOf": [
        {
          "$ref": "sayso://sayso.fork/common#/$defs/freeForkOfferPayment"
        },
        {
          "$ref": "sayso://sayso.fork/common#/$defs/paidForkOfferPayment"
        }
      ]
    },
    "forkOffer": {
      "type": "object",
      "required": [
        "offerId",
        "durationSeconds",
        "provider",
        "requiredConfiguration"
      ],
      "additionalProperties": false,
      "properties": {
        "offerId": {
          "type": "string",
          "minLength": 1
        },
        "title": {
          "type": "string",
          "minLength": 1
        },
        "description": {
          "type": "string"
        },
        "durationSeconds": {
          "type": "integer",
          "minimum": 1
        },
        "expiresAt": {
          "type": "string",
          "minLength": 1
        },
        "provider": {
          "$ref": "sayso://sayso.fork/common#/$defs/forkProvider"
        },
        "requiredConfiguration": {
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1
          },
          "uniqueItems": true
        },
        "payment": {
          "$ref": "sayso://sayso.fork/common#/$defs/forkOfferPayment"
        }
      }
    },
    "forkedAgentEndpoint": {
      "type": "object",
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
        },
        "endpointUri": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "forkOffersError": {
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
            "malformed",
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
    "forkResultError": {
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
            "malformed",
            "unknown-offer",
            "payment-required",
            "payment-invalid",
            "policy",
            "internal"
          ]
        },
        "message": {
          "type": "string",
          "minLength": 1
        }
      }
    }
  }
}
```

<a id="schema-sayso-fork-fork-offers-request-1"></a>

### Schema: `sayso.fork/fork-offers-request/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.fork/fork-offers-request/1",
  "title": "SaySo fork fork-offers-request/1 payload",
  "x-sayso-authority": "sayso.fork",
  "x-sayso-content-type": {
    "authorityId": "sayso.fork",
    "typeId": "fork-offers-request",
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
    "requestedDurationSeconds": {
      "type": "integer",
      "minimum": 1
    },
    "includePaymentRequirements": {
      "type": "boolean"
    }
  }
}
```

<a id="schema-sayso-fork-fork-offers-response-1"></a>

### Schema: `sayso.fork/fork-offers-response/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.fork/fork-offers-response/1",
  "title": "SaySo fork fork-offers-response/1 payload",
  "x-sayso-authority": "sayso.fork",
  "x-sayso-content-type": {
    "authorityId": "sayso.fork",
    "typeId": "fork-offers-response",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "oneOf": [
    {
      "type": "object",
      "required": [
        "requestId",
        "status",
        "offers"
      ],
      "additionalProperties": false,
      "properties": {
        "requestId": {
          "type": "string",
          "minLength": 1
        },
        "status": {
          "const": "ok"
        },
        "offers": {
          "type": "array",
          "items": {
            "$ref": "sayso://sayso.fork/common#/$defs/forkOffer"
          }
        },
        "generatedAt": {
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
          "const": "error"
        },
        "error": {
          "$ref": "sayso://sayso.fork/common#/$defs/forkOffersError"
        }
      }
    }
  ]
}
```

<a id="schema-sayso-fork-fork-request-1"></a>

### Schema: `sayso.fork/fork-request/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.fork/fork-request/1",
  "title": "SaySo fork fork-request/1 payload",
  "x-sayso-authority": "sayso.fork",
  "x-sayso-content-type": {
    "authorityId": "sayso.fork",
    "typeId": "fork-request",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "type": "object",
  "required": [
    "requestId",
    "offerId"
  ],
  "additionalProperties": false,
  "properties": {
    "requestId": {
      "type": "string",
      "minLength": 1
    },
    "offerId": {
      "type": "string",
      "minLength": 1
    },
    "configuration": {
      "type": "array",
      "items": {
        "$ref": "sayso://sayso.fork/common#/$defs/forkConfigurationInput"
      }
    },
    "requester": {
      "type": "object",
      "additionalProperties": true
    },
    "extensions": {
      "type": "object",
      "additionalProperties": true
    }
  }
}
```

<a id="schema-sayso-fork-fork-result-1"></a>

### Schema: `sayso.fork/fork-result/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.fork/fork-result/1",
  "title": "SaySo fork fork-result/1 payload",
  "x-sayso-authority": "sayso.fork",
  "x-sayso-content-type": {
    "authorityId": "sayso.fork",
    "typeId": "fork-result",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "oneOf": [
    {
      "type": "object",
      "required": [
        "requestId",
        "status",
        "forkId",
        "offerId",
        "provider",
        "validFrom",
        "expiresAt"
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
        "forkId": {
          "type": "string",
          "minLength": 1
        },
        "offerId": {
          "type": "string",
          "minLength": 1
        },
        "provider": {
          "$ref": "sayso://sayso.fork/common#/$defs/forkProvider"
        },
        "validFrom": {
          "type": "string",
          "minLength": 1
        },
        "expiresAt": {
          "type": "string",
          "minLength": 1
        },
        "agent": {
          "$ref": "sayso://sayso.fork/common#/$defs/forkedAgentEndpoint"
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
          "$ref": "sayso://sayso.fork/common#/$defs/forkResultError"
        }
      }
    }
  ]
}
```
