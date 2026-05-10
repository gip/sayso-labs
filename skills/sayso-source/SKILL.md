---
name: sayso-source
description: Optional SaySo skill for source code and directory snapshot retrieval.
---

# SaySo Source

Version: **0.1.0**.

This optional skill lets an agent expose a read-only snapshot of its source
directory. Callers retrieve a manifest first, then fetch file or archive bytes
in chunks. Agents that advertise this skill also advertise `sayso.configure`, so
callers can separately inspect public configuration values and private
configuration variable names.

This skill imports:

- `sayso.protocol` version `^0.1.0`
- `sayso.configure` version `^0.1.0`

## Content Types

All source content types use:

- `authorityId = "sayso.source"`
- `versionMinor = 0`
- `encoding = JSON as UTF-8 bytes`

| Type | Purpose | Schema |
|------|---------|--------|
| `source-manifest-request/1` | Request a source snapshot manifest. | [schema](#schema-sayso-source-source-manifest-request-1) |
| `source-manifest-response/1` | Return snapshot metadata, file entries, and chunk metadata. | [schema](#schema-sayso-source-source-manifest-response-1) |
| `source-chunk-request/1` | Request one file or archive chunk from a snapshot. | [schema](#schema-sayso-source-source-chunk-request-1) |
| `source-chunk-response/1` | Return one base64-encoded chunk or an error. | [schema](#schema-sayso-source-source-chunk-response-1) |

## Payloads

### `source-manifest-request/1`

```ts
type SourceManifestRequestPayload = {
  requestId: string;
  format?: "files" | "tar.gz" | "zip";
  include?: string[];
  exclude?: string[];
  maxChunkSizeBytes?: number;
};
```

Rules:

- `format` defaults to `"files"`.
- `include` and `exclude` entries are normalized relative paths or glob-like
  path prefixes interpreted by the agent.
- `maxChunkSizeBytes` is a caller preference. The agent chooses the actual
  chunk size returned in the manifest.

### `source-manifest-response/1`

```ts
type SourceFileEntry = {
  path: string;
  kind: "file";
  sizeBytes: number;
  sha256: string;
  chunks: number;
  mediaType?: string;
  executable?: boolean;
};

type SourceArchiveEntry = {
  format: "tar.gz" | "zip";
  sizeBytes: number;
  sha256: string;
  chunks: number;
  mediaType: string;
};

type SourceManifestResponsePayload =
  | {
      requestId: string;
      status: "ok";
      snapshotId: string;
      createdAt: string;
      expiresAt?: string;
      chunkSizeBytes: number;
      files: SourceFileEntry[];
      archives?: SourceArchiveEntry[];
    }
  | {
      requestId: string;
      status: "error";
      error: {
        code: "malformed" | "not-found" | "policy" | "snapshot-expired" | "internal";
        message: string;
      };
    };
```

### `source-chunk-request/1`

```ts
type SourceChunkTarget =
  | {
      kind: "file";
      path: string;
    }
  | {
      kind: "archive";
      format: "tar.gz" | "zip";
    };

type SourceChunkRequestPayload = {
  requestId: string;
  snapshotId: string;
  target: SourceChunkTarget;
  chunkIndex: number;
};
```

### `source-chunk-response/1`

```ts
type SourceChunkResponsePayload =
  | {
      requestId: string;
      status: "ok";
      snapshotId: string;
      target: SourceChunkTarget;
      chunkIndex: number;
      chunkCount: number;
      sha256: string;
      bytesBase64: string;
    }
  | {
      requestId: string;
      status: "error";
      error: {
        code: "malformed" | "not-found" | "policy" | "snapshot-expired" | "internal";
        message: string;
      };
    };
```

Rules:

- Paths are slash-separated relative paths.
- Paths must not be absolute, empty, contain empty segments, or contain `..`
  segments.
- Agents must not expose local cache, dependency, credential, or secret files
  unless the agent explicitly includes them in the manifest.
- `sha256` in `source-chunk-response/1` is the hash of the returned chunk bytes.
- Callers must verify chunk hashes and final file or archive hashes before
  using retrieved source.
- `sayso.source` exposes code and static source assets. Runtime configuration
  values are discovered through `sayso.configure`.

## Schemata

The following JSON Schema blocks are part of this skill document. They are the exact wire payload contracts for the content types or claim presentations above.

<a id="schema-sayso-source-common"></a>

### Schema: `sayso://sayso.source/common`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.source/common",
  "title": "SaySo source common schema definitions",
  "$defs": {
    "relativePath": {
      "type": "string",
      "minLength": 1,
      "pattern": "^(?!/)(?!.*(^|/)\\.\\.(/|$))(?!.*//).+$"
    },
    "sha256": {
      "type": "string",
      "pattern": "^[a-f0-9]{64}$"
    },
    "sourceError": {
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
            "snapshot-expired",
            "internal"
          ]
        },
        "message": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "sourceFileEntry": {
      "type": "object",
      "required": [
        "path",
        "kind",
        "sizeBytes",
        "sha256",
        "chunks"
      ],
      "additionalProperties": false,
      "properties": {
        "path": {
          "$ref": "sayso://sayso.source/common#/$defs/relativePath"
        },
        "kind": {
          "const": "file"
        },
        "sizeBytes": {
          "type": "integer",
          "minimum": 0
        },
        "sha256": {
          "$ref": "sayso://sayso.source/common#/$defs/sha256"
        },
        "chunks": {
          "type": "integer",
          "minimum": 1
        },
        "mediaType": {
          "type": "string",
          "minLength": 1
        },
        "executable": {
          "type": "boolean"
        }
      }
    },
    "sourceArchiveEntry": {
      "type": "object",
      "required": [
        "format",
        "sizeBytes",
        "sha256",
        "chunks",
        "mediaType"
      ],
      "additionalProperties": false,
      "properties": {
        "format": {
          "type": "string",
          "enum": [
            "tar.gz",
            "zip"
          ]
        },
        "sizeBytes": {
          "type": "integer",
          "minimum": 0
        },
        "sha256": {
          "$ref": "sayso://sayso.source/common#/$defs/sha256"
        },
        "chunks": {
          "type": "integer",
          "minimum": 1
        },
        "mediaType": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "sourceChunkTarget": {
      "oneOf": [
        {
          "type": "object",
          "required": [
            "kind",
            "path"
          ],
          "additionalProperties": false,
          "properties": {
            "kind": {
              "const": "file"
            },
            "path": {
              "$ref": "sayso://sayso.source/common#/$defs/relativePath"
            }
          }
        },
        {
          "type": "object",
          "required": [
            "kind",
            "format"
          ],
          "additionalProperties": false,
          "properties": {
            "kind": {
              "const": "archive"
            },
            "format": {
              "type": "string",
              "enum": [
                "tar.gz",
                "zip"
              ]
            }
          }
        }
      ]
    }
  }
}
```

<a id="schema-sayso-source-source-chunk-request-1"></a>

### Schema: `sayso.source/source-chunk-request/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.source/source-chunk-request/1",
  "title": "SaySo source source-chunk-request/1 payload",
  "x-sayso-authority": "sayso.source",
  "x-sayso-content-type": {
    "authorityId": "sayso.source",
    "typeId": "source-chunk-request",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "type": "object",
  "required": [
    "requestId",
    "snapshotId",
    "target",
    "chunkIndex"
  ],
  "additionalProperties": false,
  "properties": {
    "requestId": {
      "type": "string",
      "minLength": 1
    },
    "snapshotId": {
      "type": "string",
      "minLength": 1
    },
    "target": {
      "$ref": "sayso://sayso.source/common#/$defs/sourceChunkTarget"
    },
    "chunkIndex": {
      "type": "integer",
      "minimum": 0
    }
  }
}
```

<a id="schema-sayso-source-source-chunk-response-1"></a>

### Schema: `sayso.source/source-chunk-response/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.source/source-chunk-response/1",
  "title": "SaySo source source-chunk-response/1 payload",
  "x-sayso-authority": "sayso.source",
  "x-sayso-content-type": {
    "authorityId": "sayso.source",
    "typeId": "source-chunk-response",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "oneOf": [
    {
      "type": "object",
      "required": [
        "requestId",
        "status",
        "snapshotId",
        "target",
        "chunkIndex",
        "chunkCount",
        "sha256",
        "bytesBase64"
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
        "snapshotId": {
          "type": "string",
          "minLength": 1
        },
        "target": {
          "$ref": "sayso://sayso.source/common#/$defs/sourceChunkTarget"
        },
        "chunkIndex": {
          "type": "integer",
          "minimum": 0
        },
        "chunkCount": {
          "type": "integer",
          "minimum": 1
        },
        "sha256": {
          "$ref": "sayso://sayso.source/common#/$defs/sha256"
        },
        "bytesBase64": {
          "type": "string",
          "pattern": "^[A-Za-z0-9+/]*={0,2}$"
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
          "$ref": "sayso://sayso.source/common#/$defs/sourceError"
        }
      }
    }
  ]
}
```

<a id="schema-sayso-source-source-manifest-request-1"></a>

### Schema: `sayso.source/source-manifest-request/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.source/source-manifest-request/1",
  "title": "SaySo source source-manifest-request/1 payload",
  "x-sayso-authority": "sayso.source",
  "x-sayso-content-type": {
    "authorityId": "sayso.source",
    "typeId": "source-manifest-request",
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
    "format": {
      "type": "string",
      "enum": [
        "files",
        "tar.gz",
        "zip"
      ]
    },
    "include": {
      "type": "array",
      "items": {
        "type": "string",
        "minLength": 1
      },
      "uniqueItems": true
    },
    "exclude": {
      "type": "array",
      "items": {
        "type": "string",
        "minLength": 1
      },
      "uniqueItems": true
    },
    "maxChunkSizeBytes": {
      "type": "integer",
      "minimum": 1
    }
  }
}
```

<a id="schema-sayso-source-source-manifest-response-1"></a>

### Schema: `sayso.source/source-manifest-response/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.source/source-manifest-response/1",
  "title": "SaySo source source-manifest-response/1 payload",
  "x-sayso-authority": "sayso.source",
  "x-sayso-content-type": {
    "authorityId": "sayso.source",
    "typeId": "source-manifest-response",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "oneOf": [
    {
      "type": "object",
      "required": [
        "requestId",
        "status",
        "snapshotId",
        "createdAt",
        "chunkSizeBytes",
        "files"
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
        "snapshotId": {
          "type": "string",
          "minLength": 1
        },
        "createdAt": {
          "type": "string",
          "minLength": 1
        },
        "expiresAt": {
          "type": "string",
          "minLength": 1
        },
        "chunkSizeBytes": {
          "type": "integer",
          "minimum": 1
        },
        "files": {
          "type": "array",
          "items": {
            "$ref": "sayso://sayso.source/common#/$defs/sourceFileEntry"
          }
        },
        "archives": {
          "type": "array",
          "items": {
            "$ref": "sayso://sayso.source/common#/$defs/sourceArchiveEntry"
          }
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
          "$ref": "sayso://sayso.source/common#/$defs/sourceError"
        }
      }
    }
  ]
}
```
