---
name: sayso-claim
description: Optional SaySo claim presentation catalog for connection-request/1.
---

# SaySo Claim

Version: **0.1.0**.

`sayso.claim` is an optional claim skill. It defines claim presentation shapes that
an agent can accept in `sayso.protocol/connection-request/1.presentations[]`.

This skill imports:

- `sayso.protocol` version `^0.1.0`

## Skill Metadata

- `skillId = "sayso.claim"`
- `kind = "claim"`
- supported connection presentation types:
  - `sayso.claim.world-id.wallet` ([schema](#schema-sayso-claim-world-id-wallet))
  - `sayso.claim.wallet-control` ([schema](#schema-sayso-claim-wallet-control))
  - `sayso.claim.agent-connection` ([schema](#schema-sayso-claim-agent-connection))
- no custom XMTP content types

## World ID Wallet Presentation

`sayso.claim.world-id.wallet` presents a World ID 4 uniqueness proof for a wallet
address.

```ts
type WorldIdWalletPresentation = {
  type: "sayso.claim.world-id.wallet";
  payload: {
    wallet: {
      type: string;
      address: string;
    };
    version: "world-id-4";
    proofType: "uniqueness";
    rpId: string;
    action: "human";
    idkitResponse: Record<string, unknown>;
  };
};
```

The receiver verifies `payload.idkitResponse` using World ID v4. If verification
succeeds, the receiver may include a `verifiedClaims[]` entry with
`type = "sayso.claim.world-id.wallet"` and `subject = payload.wallet`.

## Wallet Control Presentation

`sayso.claim.wallet-control` presents signatures proving that the sender controls
each listed wallet.

```ts
type WalletControlPresentation = {
  type: "sayso.claim.wallet-control";
  payload: {
    message: {
      claim: "I control these wallets";
      wallets: Array<{
        type: string;
        address: string;
      }>;
      timestamp: string;
    };
    signatures: Array<{
      type: string;
      address: string;
      signatureScheme: string;
      signature: string;
    }>;
  };
};
```

Verifier expectations:

- Every wallet in `message.wallets[]` should have a matching signature with the
  same `type` and `address`.
- `message.timestamp` is the freshness input. Acceptable clock skew and replay
  windows are verifier policy.
- Signature verification is scheme-specific. Examples include EIP-191 or
  EIP-712 for Ethereum and BIP-322 for Bitcoin.
- On success, the receiver may include a `verifiedClaims[]` entry with
  `type = "sayso.claim.wallet-control"` and a subject or payload describing the
  verified wallet set.

## Agent Connection Presentation

`sayso.claim.agent-connection` presents a requester wallet signature proving that
the requester intends to connect to a specific agent.

```ts
type AgentConnectionPresentation = {
  type: "sayso.claim.agent-connection";
  payload: {
    message: {
      claim: "I want to connect to this SaySo agent";
      requester: {
        type: string;
        address: string;
      };
      agent: {
        type: string;
        address: string;
      };
      timestamp: string;
    };
    signatures: Array<{
      type: string;
      address: string;
      signatureScheme: string;
      signature: string;
    }>;
  };
};
```

Example:

```json
{
  "type": "sayso.claim.agent-connection",
  "payload": {
    "message": {
      "claim": "I want to connect to this SaySo agent",
      "requester": {
        "type": "ethereum",
        "address": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
      },
      "agent": {
        "type": "ethereum",
        "address": "0x1234567890123456789012345678901234567890"
      },
      "timestamp": "2026-05-02T00:00:00Z"
    },
    "signatures": [
      {
        "type": "ethereum",
        "address": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        "signatureScheme": "eip191",
        "signature": "0xsignature"
      }
    ]
  }
}
```

Verifier expectations:

- At least one signature should match `message.requester.type` and
  `message.requester.address`.
- `message.agent` must identify the agent endpoint or address the requester is
  connecting to, according to the receiving agent's advertised policy.
- `message.timestamp` is the freshness input. Acceptable clock skew and replay
  windows are verifier policy.
- Signature verification is scheme-specific, matching `wallet-control`.
- On success, the receiver may include a `verifiedClaims[]` entry with
  `type = "sayso.claim.agent-connection"` and `subject = payload.message.requester`.

If a presentation is unsupported, malformed, or fails verification, the agent
returns `connection-response/1` with `status = "error"` and one of:

- `presentation-unsupported`
- `presentation-malformed`
- `presentation-verification-failed`

## Schemata

The following JSON Schema blocks are part of this skill document. They are the exact wire payload contracts for the content types or claim presentations above.

<a id="schema-sayso-claim-agent-connection"></a>

### Schema: `sayso.claim.agent-connection`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.claim/agent-connection",
  "title": "SaySo agent connection claim presentation",
  "x-sayso-claim-type": "sayso.claim.agent-connection",
  "type": "object",
  "required": [
    "type",
    "payload"
  ],
  "additionalProperties": false,
  "properties": {
    "type": {
      "const": "sayso.claim.agent-connection"
    },
    "payload": {
      "type": "object",
      "required": [
        "message",
        "signatures"
      ],
      "additionalProperties": false,
      "properties": {
        "message": {
          "type": "object",
          "required": [
            "claim",
            "requester",
            "agent",
            "timestamp"
          ],
          "additionalProperties": false,
          "properties": {
            "claim": {
              "const": "I want to connect to this SaySo agent"
            },
            "requester": {
              "type": "object",
              "required": [
                "type",
                "address"
              ],
              "additionalProperties": false,
              "properties": {
                "type": {
                  "type": "string",
                  "minLength": 1
                },
                "address": {
                  "type": "string",
                  "minLength": 1
                }
              }
            },
            "agent": {
              "type": "object",
              "required": [
                "type",
                "address"
              ],
              "additionalProperties": false,
              "properties": {
                "type": {
                  "type": "string",
                  "minLength": 1
                },
                "address": {
                  "type": "string",
                  "minLength": 1
                }
              }
            },
            "timestamp": {
              "type": "string",
              "minLength": 1
            }
          }
        },
        "signatures": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "required": [
              "type",
              "address",
              "signatureScheme",
              "signature"
            ],
            "additionalProperties": false,
            "properties": {
              "type": {
                "type": "string",
                "minLength": 1
              },
              "address": {
                "type": "string",
                "minLength": 1
              },
              "signatureScheme": {
                "type": "string",
                "minLength": 1
              },
              "signature": {
                "type": "string",
                "minLength": 1
              }
            }
          }
        }
      }
    }
  }
}
```

<a id="schema-sayso-claim-wallet-control"></a>

### Schema: `sayso.claim.wallet-control`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.claim/wallet-control",
  "title": "SaySo wallet control claim presentation",
  "x-sayso-claim-type": "sayso.claim.wallet-control",
  "type": "object",
  "required": [
    "type",
    "payload"
  ],
  "additionalProperties": false,
  "properties": {
    "type": {
      "const": "sayso.claim.wallet-control"
    },
    "payload": {
      "type": "object",
      "required": [
        "message",
        "signatures"
      ],
      "additionalProperties": false,
      "properties": {
        "message": {
          "type": "object",
          "required": [
            "claim",
            "wallets",
            "timestamp"
          ],
          "additionalProperties": false,
          "properties": {
            "claim": {
              "const": "I control these wallets"
            },
            "wallets": {
              "type": "array",
              "minItems": 1,
              "items": {
                "type": "object",
                "required": [
                  "type",
                  "address"
                ],
                "additionalProperties": false,
                "properties": {
                  "type": {
                    "type": "string",
                    "minLength": 1
                  },
                  "address": {
                    "type": "string",
                    "minLength": 1
                  }
                }
              }
            },
            "timestamp": {
              "type": "string",
              "minLength": 1
            }
          }
        },
        "signatures": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "required": [
              "type",
              "address",
              "signatureScheme",
              "signature"
            ],
            "additionalProperties": false,
            "properties": {
              "type": {
                "type": "string",
                "minLength": 1
              },
              "address": {
                "type": "string",
                "minLength": 1
              },
              "signatureScheme": {
                "type": "string",
                "minLength": 1
              },
              "signature": {
                "type": "string",
                "minLength": 1
              }
            }
          }
        }
      }
    }
  }
}
```

<a id="schema-sayso-claim-world-id-wallet"></a>

### Schema: `sayso.claim.world-id.wallet`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.claim/world-id.wallet",
  "title": "SaySo World ID wallet claim presentation",
  "x-sayso-claim-type": "sayso.claim.world-id.wallet",
  "type": "object",
  "required": [
    "type",
    "payload"
  ],
  "additionalProperties": false,
  "properties": {
    "type": {
      "const": "sayso.claim.world-id.wallet"
    },
    "payload": {
      "type": "object",
      "required": [
        "wallet",
        "version",
        "proofType",
        "rpId",
        "action",
        "idkitResponse"
      ],
      "additionalProperties": false,
      "properties": {
        "wallet": {
          "type": "object",
          "required": [
            "type",
            "address"
          ],
          "additionalProperties": false,
          "properties": {
            "type": {
              "type": "string",
              "minLength": 1
            },
            "address": {
              "type": "string",
              "minLength": 1
            }
          }
        },
        "version": {
          "const": "world-id-4"
        },
        "proofType": {
          "const": "uniqueness"
        },
        "rpId": {
          "type": "string",
          "minLength": 1
        },
        "action": {
          "const": "human"
        },
        "idkitResponse": {
          "type": "object",
          "additionalProperties": true
        }
      }
    }
  }
}
```
