---
name: sayso-finance-oracle
description: SaySo finance service skill for Coinbase spot ticker prices.
---

# SaySo Finance Oracle

Version: **0.1.0**.

This skill defines a no-payment oracle service that returns current spot ticker
prices for configured Coinbase markets. The service imports `sayso.protocol` and
is advertised alongside `sayso.runtime` and `sayso.configure` so callers can
inspect the portable host/runtime boundary, supported markets, and optional
private credential metadata.

## Skill Metadata

- `skillId = "sayso.finance.oracle"`
- `kind = "service"`
- imports `sayso.protocol` version `^0.1.0`
- `paymentPolicy = "none"`

## Reference Agent Bundle

The runnable `sayso-oracle` reference implementation advertises the following
skills in dependency order:

- `sayso.protocol`
- `sayso.runtime`
- `sayso.configure`
- `sayso.finance.oracle`

The Node host owns XMTP transport, connection state, wallet custody, Coinbase
WebSocket subscriptions, Coinbase JWT signing, and outbound message delivery.
The oracle business callbacks can run either natively or through the
`sayso.runtime` QuickJS reference path.

In the QuickJS reference path, the oracle business callbacks are packaged as a
single self-contained JavaScript runtime app using the standard
`createApplication({ sayso })` shape from `sayso.runtime`. The sandboxed app has no
runtime imports or external dependencies. It receives public configuration
through `params.get` and ticker-cache snapshots through JSON callback inputs.
XMTP clients, wallet objects, Coinbase credentials, private keys, sockets, and
filesystem access remain host-owned and never enter the sandbox.

## Content Types

All content types in this skill use:

- `authorityId = "sayso.finance.oracle"`
- `versionMinor = 0`
- `encoding = JSON as UTF-8 bytes`

| Type | Purpose |
|------|---------|
| `spot-price-request/1` | Request spot ticker prices for one or more markets. |
| `spot-price-response/1` | Return per-market spot ticker prices or per-market errors. |

## Capability

```ts
type OracleCapability = {
  capabilityId: "oracle.spot-price";
  requestContentTypes: ["sayso.finance.oracle/spot-price-request/1"];
  responseContentTypes: ["sayso.finance.oracle/spot-price-response/1"];
  channels: ["sync"];
  paymentPolicy: "none";
};
```

## Payloads

### `spot-price-request/1`

```ts
type SpotPriceRequestPayload = {
  requestId: string;
  markets: string[];
};
```

Markets may be sent as `BTC/USD` or `BTC-USD`; the oracle normalizes them to
Coinbase product IDs.

### `spot-price-response/1`

```ts
type SpotPriceResponsePayload = {
  requestId: string;
  status: "ok";
  generatedAt: string;
  results: Array<
    | {
        requestedMarket: string;
        productId: string;
        status: "ok";
        price: string;
        bestBid?: string;
        bestAsk?: string;
        asOf: string;
        source: "coinbase.websocket.ticker";
        sequenceNum?: number;
      }
    | {
        requestedMarket: string;
        productId?: string;
        status: "error";
        error: {
          code: "unsupported-market" | "stale-or-unavailable";
          message: string;
        };
      }
  >;
};
```

Rules:

- `requestId` is required and must be copied into the response.
- Batch requests return one result for each requested market.
- Unsupported markets return `unsupported-market` for that result only.
- Supported markets without a fresh ticker return `stale-or-unavailable`.
- `price` is Coinbase's ticker `price` field. `bestBid` and `bestAsk` are
  included when Coinbase sends them.
- The reference oracle may subscribe to Coinbase's public market-data
  WebSocket without authentication, or use optional Coinbase API credentials to
  sign subscription messages with JWTs.
- When the reference oracle runs with `--runtime quickjs`, Coinbase ticker
  cache entries are copied into QuickJS as JSON snapshots. QuickJS does not
  open Coinbase network connections, receive Coinbase credentials, or access
  XMTP/wallet host objects directly.
