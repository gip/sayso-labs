---
name: sayso-payment
description: Optional SaySo payment skill for x402-shaped payment negotiation over XMTP.
---

# SaySo Payment

Version: **0.1.0**.

This optional skill defines payment negotiation for SaySo agents. Agents import
and advertise it only when they expose capabilities that require or optionally
accept payment.

This skill imports:

- `sayso.protocol` version `^0.1.0`

## Content Types

All payment content types use:

- `authorityId = "sayso.payment"`
- `versionMinor = 0`
- `encoding = JSON as UTF-8 bytes`

| Type | Purpose | Schema |
|------|---------|--------|
| `payment-required/1` | Describe payment requirements for a request. | [schema](#schema-sayso-payment-payment-required-1) |
| `payment-submit/1` | Submit an x402 payment payload. | [schema](#schema-sayso-payment-payment-submit-1) |
| `payment-result/1` | Report payment verification, settlement, or failure. | [schema](#schema-sayso-payment-payment-result-1) |

## Payment Model

Payments use x402-shaped requirements and payloads carried as XMTP messages.
Resources are bound to XMTP requests using `xmtp://` URLs so payment cannot be
replayed against unrelated requests:

```txt
xmtp://sayso.payment/<agentId>/requests/<requestId>
```

`requestId` is minted by the caller for the skill-defined action being paid
for. One `requestId` maps to one caller-intended action for a given sender
inbox and agent unless the relevant service skill explicitly defines broader
passes, quotas, or expiries.

## Payloads

### `payment-required/1`

```ts
type X402ResourceInfo = {
  url: `xmtp://${string}`;
  description?: string;
  mimeType?: string;
};

type X402PaymentRequirements = {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
};

type PaymentRequiredPayload = {
  requestId: string;
  x402Version: number;
  resource: X402ResourceInfo;
  accepts: X402PaymentRequirements[];
  extensions?: Record<string, unknown>;
  reason?: string;
};
```

### `payment-submit/1`

```ts
type X402PaymentPayload = {
  x402Version: number;
  resource?: X402ResourceInfo;
  accepted: X402PaymentRequirements;
  payload: Record<string, unknown>;
  extensions?: Record<string, unknown>;
};

type PaymentSubmitPayload = {
  requestId: string;
  payment: X402PaymentPayload;
};
```

### `payment-result/1`

```ts
type PaymentResultPayload =
  | {
      status: "verified" | "settled";
      requestId: string;
      payer: string | null;
      transaction: string | null;
      network: string;
      extensions?: Record<string, unknown>;
    }
  | {
      status: "error";
      requestId: string;
      error: {
        code: "payment-required" | "payment-invalid" | "payment-failed" | "request-expired" | "internal";
        message: string;
      };
    };
```

Rules:

- Paid capabilities must advertise a non-`none` `paymentPolicy` in their
  service skill and include `sayso.payment` in the skill bundle.
- `payment-submit/1` must reference one requirement from the most recent
  `payment-required/1` for the same sender inbox and `requestId`.
- The receiver must reject mismatched sender inboxes, agent ids, request ids,
  resource URLs, assets, amounts, networks, or payee addresses.
- Settlement may be facilitator-backed or locally verified, but the request,
  proof, and result remain on XMTP.
- The default fulfillment rule is: perform paid work only after `settled`.
  Fulfillment after `verified` is allowed only when the service skill
  explicitly accepts that settlement risk.

## Schemata

The following JSON Schema blocks are part of this skill document. They are the exact wire payload contracts for the content types or claim presentations above.

<a id="schema-sayso-payment-common"></a>

### Schema: `sayso://sayso.payment/common`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.payment/common",
  "title": "SaySo payment common schema definitions",
  "$defs": {
    "x402ResourceInfo": {
      "type": "object",
      "required": [
        "url"
      ],
      "additionalProperties": false,
      "properties": {
        "url": {
          "type": "string",
          "pattern": "^xmtp://"
        },
        "description": {
          "type": "string"
        },
        "mimeType": {
          "type": "string"
        }
      }
    },
    "x402PaymentRequirements": {
      "type": "object",
      "required": [
        "scheme",
        "network",
        "asset",
        "amount",
        "payTo",
        "maxTimeoutSeconds",
        "extra"
      ],
      "additionalProperties": false,
      "properties": {
        "scheme": {
          "type": "string",
          "minLength": 1
        },
        "network": {
          "type": "string",
          "minLength": 1
        },
        "asset": {
          "type": "string",
          "minLength": 1
        },
        "amount": {
          "type": "string",
          "minLength": 1
        },
        "payTo": {
          "type": "string",
          "minLength": 1
        },
        "maxTimeoutSeconds": {
          "type": "integer",
          "minimum": 1
        },
        "extra": {
          "type": "object",
          "additionalProperties": true
        }
      }
    }
  }
}
```

<a id="schema-sayso-payment-payment-required-1"></a>

### Schema: `sayso.payment/payment-required/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.payment/payment-required/1",
  "title": "SaySo payment-required/1 payload",
  "x-sayso-authority": "sayso.payment",
  "x-sayso-content-type": {
    "authorityId": "sayso.payment",
    "typeId": "payment-required",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "type": "object",
  "required": [
    "requestId",
    "x402Version",
    "resource",
    "accepts"
  ],
  "additionalProperties": false,
  "properties": {
    "requestId": {
      "type": "string",
      "minLength": 1
    },
    "x402Version": {
      "type": "integer",
      "minimum": 1
    },
    "resource": {
      "$ref": "sayso://sayso.payment/common#/$defs/x402ResourceInfo"
    },
    "accepts": {
      "type": "array",
      "minItems": 1,
      "items": {
        "$ref": "sayso://sayso.payment/common#/$defs/x402PaymentRequirements"
      }
    },
    "extensions": {
      "type": "object",
      "additionalProperties": true
    },
    "reason": {
      "type": "string"
    }
  }
}
```

<a id="schema-sayso-payment-payment-result-1"></a>

### Schema: `sayso.payment/payment-result/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.payment/payment-result/1",
  "title": "SaySo payment-result/1 payload",
  "x-sayso-authority": "sayso.payment",
  "x-sayso-content-type": {
    "authorityId": "sayso.payment",
    "typeId": "payment-result",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "oneOf": [
    {
      "type": "object",
      "required": [
        "status",
        "requestId",
        "payer",
        "transaction",
        "network"
      ],
      "additionalProperties": false,
      "properties": {
        "status": {
          "enum": [
            "verified",
            "settled"
          ]
        },
        "requestId": {
          "type": "string",
          "minLength": 1
        },
        "payer": {
          "type": [
            "string",
            "null"
          ]
        },
        "transaction": {
          "type": [
            "string",
            "null"
          ]
        },
        "network": {
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
        "status",
        "requestId",
        "error"
      ],
      "additionalProperties": false,
      "properties": {
        "status": {
          "const": "error"
        },
        "requestId": {
          "type": "string",
          "minLength": 1
        },
        "error": {
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
                "payment-required",
                "payment-invalid",
                "payment-failed",
                "request-expired",
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
  ]
}
```

<a id="schema-sayso-payment-payment-submit-1"></a>

### Schema: `sayso.payment/payment-submit/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.payment/payment-submit/1",
  "title": "SaySo payment-submit/1 payload",
  "x-sayso-authority": "sayso.payment",
  "x-sayso-content-type": {
    "authorityId": "sayso.payment",
    "typeId": "payment-submit",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "type": "object",
  "required": [
    "requestId",
    "payment"
  ],
  "additionalProperties": false,
  "properties": {
    "requestId": {
      "type": "string",
      "minLength": 1
    },
    "payment": {
      "type": "object",
      "required": [
        "x402Version",
        "accepted",
        "payload"
      ],
      "additionalProperties": false,
      "properties": {
        "x402Version": {
          "type": "integer",
          "minimum": 1
        },
        "resource": {
          "$ref": "sayso://sayso.payment/common#/$defs/x402ResourceInfo"
        },
        "accepted": {
          "$ref": "sayso://sayso.payment/common#/$defs/x402PaymentRequirements"
        },
        "payload": {
          "type": "object",
          "additionalProperties": true
        },
        "extensions": {
          "type": "object",
          "additionalProperties": true
        }
      }
    }
  }
}
```
