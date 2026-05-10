import type { ConfigurationRequestPayload, ConfigurationResponsePayload, ConfigurationVariable } from "../sayso/types.js";

export type PongRuntimeConfiguration = {
  xmtpEnv: string;
  networkAgent: string;
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

export const pongConfigurationVariables = (
  runtime: PongRuntimeConfiguration,
): ConfigurationVariable[] => [
  withOptionalValue(
    {
      name: "XMTP_ENV",
      visibility: "public",
      description: "XMTP network environment used by the pong agent.",
      valueType: "string",
      source: "runtime",
    },
    runtime.xmtpEnv,
  ),
  withOptionalValue(
    {
      name: "SAYSO_NETWORK_AGENT",
      visibility: "public",
      description: "SaySo Network registry agent wallet address or inbox ID used for registration.",
      valueType: "string",
      source: "runtime",
    },
    runtime.networkAgent,
  ),
  withOptionalValue(
    {
      name: "DEBUG",
      visibility: "public",
      description: "Debug logging selector for the pong process.",
      valueType: "string",
      source: "environment",
      required: false,
    },
    runtime.debug,
  ),
  {
    name: "XMTP_PRIVATE_KEY",
    visibility: "private",
    description: "Wallet private key used to create the pong XMTP client.",
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
  withOptionalValue(
    {
      name: "XMTP_DB_DIR",
      visibility: "public",
      description: "Base directory for the pong agent's local XMTP database.",
      valueType: "string",
      source: "runtime",
    },
    runtime.dbDir,
  ),
];

const withoutValue = (variable: ConfigurationVariable): ConfigurationVariable => {
  const { value: _value, ...rest } = variable;
  return rest;
};

export const createPongConfigurationResponse = (
  request: ConfigurationRequestPayload,
  runtime: PongRuntimeConfiguration,
  generatedAt = new Date().toISOString(),
): ConfigurationResponsePayload => {
  const requestedNames = request.names ? new Set(request.names) : null;
  const includeValues = request.includeValues ?? "public";
  const variables = pongConfigurationVariables(runtime)
    .filter((variable) => !requestedNames || requestedNames.has(variable.name))
    .map((variable) => (includeValues === "none" ? withoutValue(variable) : variable));

  return {
    requestId: request.requestId,
    status: "ok",
    variables,
    generatedAt,
  };
};

export const createPongConfigurationError = (
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
