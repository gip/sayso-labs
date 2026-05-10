---
name: sayso-labs-implementations
description: Optional example SaySo skill for agents that can list and deliver reference implementations for advertised capabilities or content types.
---

# SaySo Reference Implementations

Version: **0.1.0**.

This is an optional example SaySo skill. Agents advertise it only when they can
provide reference implementations for capabilities or content types exposed in
their skill bundle. It is not part of the mandatory `sayso.protocol` meta
protocol.

Agents that expose their own full source directory should advertise
`sayso.source`. This example skill is only for small, inline reference
implementations tied to capabilities or content types.

This skill imports:

- `sayso.protocol` version `^0.1.0`

## Content Types

All content types in this skill use:

- `authorityId = "sayso.reference-implementations"`
- `versionMinor = 0`
- `encoding = JSON as UTF-8 bytes`

| Type | Purpose | Schema |
|------|---------|--------|
| `implementation-list-request/1` | Ask which reference implementations are available. | [schema](#schema-sayso-labs-implementations-implementation-list-request-1) |
| `implementation-list-response/1` | Return implementation descriptors. | [schema](#schema-sayso-labs-implementations-implementation-list-response-1) |
| `implementation-request/1` | Ask for a specific reference implementation. | [schema](#schema-sayso-labs-implementations-implementation-request-1) |
| `implementation-response/1` | Return inline implementation source or an error. | [schema](#schema-sayso-labs-implementations-implementation-response-1) |

## Implementation Descriptor

```ts
type ImplementationDescriptor = {
  implementationId: string;
  implements: string[];
  language: string;
  runtime: string;
  entrypoint: string;
  source: string;
  sha256: string;
  permissions: string[];
  signature?: string;
};
```

Rules:

- Reference implementations are optional feature material, not trusted protocol
  logic.
- Receivers must verify `sha256` before using inline source.
- Receivers must not execute source unless local runtime policy accepts the
  declared `permissions`.
- Agents that do not advertise this skill are not expected to support any
  reference implementation content types.

## Schemata

The following JSON Schema blocks are part of this skill document. They are the exact wire payload contracts for the content types or claim presentations above.

<a id="schema-sayso-labs-implementations-implementation-list-request-1"></a>

### Schema: `sayso.reference-implementations/implementation-list-request/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.reference-implementations/implementation-list-request/1",
  "title": "SaySo reference implementations implementation-list-request/1 payload",
  "x-sayso-authority": "sayso.reference-implementations",
  "x-sayso-content-type": {
    "authorityId": "sayso.reference-implementations",
    "typeId": "implementation-list-request",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "implements": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "uniqueItems": true
    },
    "language": {
      "type": "string"
    }
  }
}
```

<a id="schema-sayso-labs-implementations-implementation-list-response-1"></a>

### Schema: `sayso.reference-implementations/implementation-list-response/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.reference-implementations/implementation-list-response/1",
  "title": "SaySo reference implementations implementation-list-response/1 payload",
  "x-sayso-authority": "sayso.reference-implementations",
  "x-sayso-content-type": {
    "authorityId": "sayso.reference-implementations",
    "typeId": "implementation-list-response",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "type": "object",
  "required": [
    "implementations"
  ],
  "additionalProperties": false,
  "properties": {
    "implementations": {
      "type": "array",
      "items": {
        "$ref": "sayso://sayso.protocol/common#/$defs/implementationDescriptor"
      }
    }
  }
}
```

<a id="schema-sayso-labs-implementations-implementation-request-1"></a>

### Schema: `sayso.reference-implementations/implementation-request/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.reference-implementations/implementation-request/1",
  "title": "SaySo reference implementations implementation-request/1 payload",
  "x-sayso-authority": "sayso.reference-implementations",
  "x-sayso-content-type": {
    "authorityId": "sayso.reference-implementations",
    "typeId": "implementation-request",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "type": "object",
  "required": [
    "implementationId"
  ],
  "additionalProperties": false,
  "properties": {
    "implementationId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

<a id="schema-sayso-labs-implementations-implementation-response-1"></a>

### Schema: `sayso.reference-implementations/implementation-response/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.reference-implementations/implementation-response/1",
  "title": "SaySo reference implementations implementation-response/1 payload",
  "x-sayso-authority": "sayso.reference-implementations",
  "x-sayso-content-type": {
    "authorityId": "sayso.reference-implementations",
    "typeId": "implementation-response",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "oneOf": [
    {
      "type": "object",
      "required": [
        "status",
        "implementation"
      ],
      "additionalProperties": false,
      "properties": {
        "status": {
          "const": "ok"
        },
        "implementation": {
          "$ref": "sayso://sayso.protocol/common#/$defs/implementationDescriptor"
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
