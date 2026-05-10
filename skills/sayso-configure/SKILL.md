---
name: sayso-configure
description: Optional SaySo skill for read-only agent configuration discovery.
---

# SaySo Configure

Version: **0.1.0**.

This optional skill lets callers inspect the configuration variables an agent
uses. It is read-only. Agents that advertise this skill expose variable names
and metadata for public and private variables, and expose values only for
public variables.

This skill imports:

- `sayso.protocol` version `^0.1.0`

## Content Types

All configure content types use:

- `authorityId = "sayso.configure"`
- `versionMinor = 0`
- `encoding = JSON as UTF-8 bytes`

| Type | Purpose | Schema |
|------|---------|--------|
| `configuration-request/1` | Request visible configuration variable metadata. | [schema](#schema-sayso-configure-configuration-request-1) |
| `configuration-response/1` | Return public values and private variable metadata. | [schema](#schema-sayso-configure-configuration-response-1) |

## Payloads

### `configuration-request/1`

```ts
type ConfigurationRequestPayload = {
  requestId: string;
  names?: string[];
  includeValues?: "public" | "none";
};
```

Rules:

- `names` filters the response to specific variable names.
- `includeValues` defaults to `"public"`.
- `includeValues = "none"` asks the agent to omit all values, including public
  values.
- A request cannot update, create, delete, or override configuration variables.

### `configuration-response/1`

```ts
type ConfigurationValue =
  | null
  | boolean
  | number
  | string
  | ConfigurationValue[]
  | { [key: string]: ConfigurationValue };

type ConfigurationVariable = {
  name: string;
  visibility: "public" | "private";
  description?: string;
  valueType?: "string" | "number" | "boolean" | "json" | "url" | "secret" | string;
  required?: boolean;
  source?: "environment" | "runtime" | "default" | "secret-store" | string;
  value?: ConfigurationValue;
};

type ConfigurationResponsePayload =
  | {
      requestId: string;
      status: "ok";
      variables: ConfigurationVariable[];
      generatedAt?: string;
    }
  | {
      requestId: string;
      status: "error";
      error: {
        code: "malformed" | "not-found" | "policy" | "internal";
        message: string;
      };
    };
```

Rules:

- `variables[].name` is the stable key callers use when supplying
  configuration to other skills such as `sayso.fork`.
- Private variables must never include `value`.
- Public variables may include `value` unless the request used
  `includeValues = "none"`.
- The response may omit unknown requested names or return `status = "error"`
  with `code = "not-found"`, according to agent policy.
- Configuration values are snapshots for discovery. They do not create a
  long-lived subscription.

## Schemata

The following JSON Schema blocks are part of this skill document. They are the exact wire payload contracts for the content types or claim presentations above.

<a id="schema-sayso-configure-common"></a>

### Schema: `sayso://sayso.configure/common`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.configure/common",
  "title": "SaySo configure common schema definitions",
  "$defs": {
    "configurationValue": {
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
            "$ref": "sayso://sayso.configure/common#/$defs/configurationValue"
          }
        },
        {
          "type": "object",
          "additionalProperties": {
            "$ref": "sayso://sayso.configure/common#/$defs/configurationValue"
          }
        }
      ]
    },
    "publicConfigurationVariable": {
      "type": "object",
      "required": [
        "name",
        "visibility"
      ],
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string",
          "minLength": 1
        },
        "visibility": {
          "const": "public"
        },
        "description": {
          "type": "string"
        },
        "valueType": {
          "type": "string",
          "minLength": 1
        },
        "required": {
          "type": "boolean"
        },
        "source": {
          "type": "string",
          "minLength": 1
        },
        "value": {
          "$ref": "sayso://sayso.configure/common#/$defs/configurationValue"
        }
      }
    },
    "privateConfigurationVariable": {
      "type": "object",
      "required": [
        "name",
        "visibility"
      ],
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string",
          "minLength": 1
        },
        "visibility": {
          "const": "private"
        },
        "description": {
          "type": "string"
        },
        "valueType": {
          "type": "string",
          "minLength": 1
        },
        "required": {
          "type": "boolean"
        },
        "source": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "configurationVariable": {
      "oneOf": [
        {
          "$ref": "sayso://sayso.configure/common#/$defs/publicConfigurationVariable"
        },
        {
          "$ref": "sayso://sayso.configure/common#/$defs/privateConfigurationVariable"
        }
      ]
    },
    "configurationError": {
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
            "not-found",
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

<a id="schema-sayso-configure-configuration-request-1"></a>

### Schema: `sayso.configure/configuration-request/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.configure/configuration-request/1",
  "title": "SaySo configure configuration-request/1 payload",
  "x-sayso-authority": "sayso.configure",
  "x-sayso-content-type": {
    "authorityId": "sayso.configure",
    "typeId": "configuration-request",
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
    "names": {
      "type": "array",
      "items": {
        "type": "string",
        "minLength": 1
      },
      "uniqueItems": true
    },
    "includeValues": {
      "type": "string",
      "enum": [
        "public",
        "none"
      ]
    }
  }
}
```

<a id="schema-sayso-configure-configuration-response-1"></a>

### Schema: `sayso.configure/configuration-response/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.configure/configuration-response/1",
  "title": "SaySo configure configuration-response/1 payload",
  "x-sayso-authority": "sayso.configure",
  "x-sayso-content-type": {
    "authorityId": "sayso.configure",
    "typeId": "configuration-response",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "oneOf": [
    {
      "type": "object",
      "required": [
        "requestId",
        "status",
        "variables"
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
        "variables": {
          "type": "array",
          "items": {
            "$ref": "sayso://sayso.configure/common#/$defs/configurationVariable"
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
          "$ref": "sayso://sayso.configure/common#/$defs/configurationError"
        }
      }
    }
  ]
}
```
