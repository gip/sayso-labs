---
name: sayso-demo-pong
description: Optional SaySo service skill for a no-payment ping/pong demo agent.
---

# SaySo Demo Pong

Version: **0.1.0**.

This skill defines a minimal no-payment pong service for SaySo agents. The
`sayso.demo.pong` service imports the mandatory `sayso.protocol` meta protocol.
The reference pong CLI advertises this service alongside `sayso.runtime`,
`sayso.configure`, and `sayso.source`, so callers can inspect its runtime
configuration metadata, fetch a curated read-only source snapshot, and see the
portable host/runtime boundary used by the QuickJS reference path.

## Skill Metadata

- `skillId = "sayso.demo.pong"`
- `kind = "service"`
- imports `sayso.protocol` version `^0.1.0`
- `paymentPolicy = "none"`

## Reference Agent Bundle

The runnable `sayso-pong-agent` reference implementation advertises the following
skills in dependency order:

- `sayso.protocol`
- `sayso.runtime`
- `sayso.configure`
- `sayso.source`
- `sayso.demo.pong`

Its `sayso.source` snapshot is limited to the pong CLI source files, shared SaySo CLI
helpers, and relevant skill documents, including `sayso.runtime`. Archive
snapshots are not supported by the reference pong agent.

## Content Types

All content types in this skill use:

- `authorityId = "sayso.demo.pong"`
- `versionMinor = 0`
- `encoding = JSON as UTF-8 bytes`

| Type | Purpose | Schema |
|------|---------|--------|
| `ping-request/1` | Ask the pong agent to respond. | [schema](#schema-sayso-demo-pong-ping-request-1) |
| `pong-response/1` | Return the pong response. | [schema](#schema-sayso-demo-pong-pong-response-1) |

## Capability

```ts
type PongCapability = {
  capabilityId: "pong.respond";
  requestContentTypes: ["sayso.demo.pong/ping-request/1"];
  responseContentTypes: ["sayso.demo.pong/pong-response/1"];
  channels: ["sync"];
  paymentPolicy: "none";
};
```

## Payloads

### `ping-request/1`

```ts
type PingRequestPayload = {
  requestId: string;
  message?: string;
  sentAt?: string;
};
```

### `pong-response/1`

```ts
type PongResponsePayload = {
  requestId: string;
  message: "pong";
  receivedMessage?: string;
  receivedAt: string;
  respondedAt: string;
};
```

Rules:

- `requestId` is required and must be copied into the response.
- `sentAt`, when present, should be an ISO 8601 timestamp.
- The service never requires payment.
- Agents that advertise this skill must respond to a valid `ping-request/1`
  after SaySo connection.
- The reference pong agent responds to `sayso.configure/configuration-request/1`,
  `sayso.source/source-manifest-request/1`, and `sayso.source/source-chunk-request/1`
  through the same sync channel after SaySo connection.

## Schemata

The following JSON Schema blocks are part of this skill document. They are the exact wire payload contracts for the content types or claim presentations above.

<a id="schema-sayso-demo-pong-ping-request-1"></a>

### Schema: `sayso.demo.pong/ping-request/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.demo.pong/ping-request/1",
  "title": "SaySo demo pong ping-request/1 payload",
  "x-sayso-authority": "sayso.demo.pong",
  "x-sayso-content-type": {
    "authorityId": "sayso.demo.pong",
    "typeId": "ping-request",
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
    "message": {
      "type": "string"
    },
    "sentAt": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

<a id="schema-sayso-demo-pong-pong-response-1"></a>

### Schema: `sayso.demo.pong/pong-response/1`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sayso://sayso.demo.pong/pong-response/1",
  "title": "SaySo demo pong pong-response/1 payload",
  "x-sayso-authority": "sayso.demo.pong",
  "x-sayso-content-type": {
    "authorityId": "sayso.demo.pong",
    "typeId": "pong-response",
    "versionMajor": 1,
    "versionMinor": 0
  },
  "type": "object",
  "required": [
    "requestId",
    "message",
    "receivedAt",
    "respondedAt"
  ],
  "additionalProperties": false,
  "properties": {
    "requestId": {
      "type": "string",
      "minLength": 1
    },
    "message": {
      "const": "pong"
    },
    "receivedMessage": {
      "type": "string"
    },
    "receivedAt": {
      "type": "string",
      "format": "date-time"
    },
    "respondedAt": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```
