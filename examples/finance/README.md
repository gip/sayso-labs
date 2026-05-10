# SaySo Finance

Service agents related to financial data.

## sayso-oracle

`sayso-oracle` is a no-payment SaySo service agent that exposes Coinbase spot ticker
prices for configured markets over XMTP. It advertises `sayso.runtime` and can run
its oracle business callbacks either natively or through the QuickJS reference
runtime. XMTP transport, wallet custody, Coinbase WebSocket/JWT handling, and
message delivery remain owned by the Node host.

The QuickJS path loads a single self-contained JavaScript runtime app. The
sandboxed app has no runtime imports or external dependencies; it receives
public configuration through `params.get` and ticker snapshots as JSON callback
input.

Required private environment variables:

- `XMTP_PRIVATE_KEY`
- `XMTP_DB_ENCRYPTION_KEY`

Optional Coinbase authentication:

- `COINBASE_API_KEY_NAME`
- `COINBASE_API_PRIVATE_KEY`

If both Coinbase variables are set, `sayso-oracle` signs WebSocket subscription
messages with JWTs. If neither is set, it uses Coinbase's public market-data
subscription path without a JWT. Setting only one Coinbase variable is treated
as a configuration error.

Common public/runtime configuration:

- `SAYSO_ORACLE_MARKETS`, comma-separated market list such as `BTC/USD,ETH/USD`
- `SAYSO_ORACLE_STALE_AFTER_MS`, default `30000`
- `COINBASE_WS_URL`, default `wss://advanced-trade-ws.coinbase.com`

Run locally:

```bash
pnpm install
pnpm sayso-oracle --markets BTC/USD,ETH/USD
```

Run the QuickJS runtime path:

```bash
pnpm sayso-oracle --runtime quickjs --markets BTC/USD,ETH/USD
```

## sayso-demo

`sayso-demo` is an interactive XMTP client for `sayso-oracle`. It runs its command
loop as a self-contained `sayso.runtime` app. The Node host owns terminal I/O,
the XMTP client, wallet custody, and request delivery; the runtime app uses
`local.text.write`, `local.text.read`, and demo host operations only. It uses
its own wallet and local XMTP database, connects to an oracle wallet address or
inbox ID, discovers supported pairs through `sayso.configure`, and lets the user
request spot prices.

Required private environment variables:

- `XMTP_PRIVATE_KEY`
- `XMTP_DB_ENCRYPTION_KEY`

Run locally:

```bash
pnpm sayso-demo --private-key <hex-private-key> <sayso-oracle-wallet-or-inbox>
```

Interactive commands:

- `pairs`
- `price BTC/USD`
- `price BTC/USD ETH/USD`
- `BTCUSD`
- `help`
- `quit`
