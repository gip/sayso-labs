import type { ConfigurationRequestPayload, ConfigurationResponsePayload, ConfigurationVariable } from "../sayso/types.js";
import { formatConfiguredMarkets } from "./markets.js";

export type OracleRuntimeConfiguration = {
  markets: Set<string>;
  staleAfterMs: number;
  coinbaseWsUrl: string;
  coinbaseAuthenticated: boolean;
  xmtpEnv: string;
  networkAgent?: string;
  debug?: string;
  dbDir: string;
};

const withOptionalValue = (
  variable: ConfigurationVariable,
  value: ConfigurationVariable["value"] | undefined,
): ConfigurationVariable => {
  if (value === undefined) return variable;
  return { ...variable, value };
};

export const oracleConfigurationVariables = (
  runtime: OracleRuntimeConfiguration,
): ConfigurationVariable[] => [
  withOptionalValue(
    {
      name: "SAYSO_ORACLE_MARKETS",
      visibility: "public",
      description: "Comma-separated Coinbase spot markets this oracle supports.",
      valueType: "string",
      source: "runtime",
      required: true,
    },
    formatConfiguredMarkets(runtime.markets),
  ),
  withOptionalValue(
    {
      name: "SAYSO_ORACLE_STALE_AFTER_MS",
      visibility: "public",
      description: "Maximum ticker cache age before a market is reported stale.",
      valueType: "number",
      source: "runtime",
      required: true,
    },
    runtime.staleAfterMs,
  ),
  withOptionalValue(
    {
      name: "COINBASE_WS_URL",
      visibility: "public",
      description: "Coinbase Advanced Trade WebSocket URL.",
      valueType: "url",
      source: "runtime",
      required: true,
    },
    runtime.coinbaseWsUrl,
  ),
  withOptionalValue(
    {
      name: "COINBASE_AUTH_MODE",
      visibility: "public",
      description: "Coinbase WebSocket subscription mode used by the oracle.",
      valueType: "string",
      source: "runtime",
      required: true,
    },
    runtime.coinbaseAuthenticated ? "authenticated" : "public",
  ),
  withOptionalValue(
    {
      name: "XMTP_ENV",
      visibility: "public",
      description: "XMTP network environment used by the oracle agent.",
      valueType: "string",
      source: "runtime",
      required: true,
    },
    runtime.xmtpEnv,
  ),
  withOptionalValue(
    {
      name: "SAYSO_NETWORK_AGENT",
      visibility: "public",
      description: "Configured SaySo Network registry agent wallet address or inbox ID, when provided.",
      valueType: "string",
      source: "runtime",
      required: false,
    },
    runtime.networkAgent,
  ),
  withOptionalValue(
    {
      name: "XMTP_DB_DIR",
      visibility: "public",
      description: "Base directory for the oracle agent's local XMTP database.",
      valueType: "string",
      source: "runtime",
      required: true,
    },
    runtime.dbDir,
  ),
  withOptionalValue(
    {
      name: "DEBUG",
      visibility: "public",
      description: "Debug logging selector for the oracle process.",
      valueType: "string",
      source: "environment",
      required: false,
    },
    runtime.debug,
  ),
  {
    name: "COINBASE_API_KEY_NAME",
    visibility: "private",
    description: "Optional Coinbase CDP API key name used to sign WebSocket JWT subscription messages.",
    valueType: "secret",
    source: "environment",
    required: false,
  },
  {
    name: "COINBASE_API_PRIVATE_KEY",
    visibility: "private",
    description: "Optional Coinbase ECDSA private key used to sign WebSocket JWT subscription messages.",
    valueType: "secret",
    source: "environment",
    required: false,
  },
  {
    name: "XMTP_PRIVATE_KEY",
    visibility: "private",
    description: "Wallet private key used to create the oracle XMTP client.",
    valueType: "secret",
    source: "environment",
    required: true,
  },
  {
    name: "XMTP_DB_ENCRYPTION_KEY",
    visibility: "private",
    description: "Encryption key for the local XMTP database.",
    valueType: "secret",
    source: "environment",
    required: true,
  },
];

const withoutValue = (variable: ConfigurationVariable): ConfigurationVariable => {
  const { value: _value, ...rest } = variable;
  return rest;
};

export const createOracleConfigurationResponse = (
  request: ConfigurationRequestPayload,
  runtime: OracleRuntimeConfiguration,
  generatedAt = new Date().toISOString(),
): ConfigurationResponsePayload => {
  const requestedNames = request.names ? new Set(request.names) : null;
  const includeValues = request.includeValues ?? "public";
  const variables = oracleConfigurationVariables(runtime)
    .filter((variable) => !requestedNames || requestedNames.has(variable.name))
    .map((variable) => (includeValues === "none" ? withoutValue(variable) : variable));

  return {
    requestId: request.requestId,
    status: "ok",
    variables,
    generatedAt,
  };
};

export const createOracleConfigurationError = (
  requestId: string,
  code: Extract<ConfigurationResponsePayload, { status: "error" }>["error"]["code"],
  message: string,
): ConfigurationResponsePayload => ({
  requestId,
  status: "error",
  error: {
    code,
    message,
  },
});
