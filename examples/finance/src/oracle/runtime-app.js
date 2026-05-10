const createApplication = ({ sayso }) => {
  const CONTENT_TYPES = Object.freeze({
    connectionResponse: "sayso.protocol/connection-response/1",
    skillResponse: "sayso.protocol/skill-response/1",
    disconnectAck: "sayso.protocol/disconnect-ack/1",
    error: "sayso.protocol/error/1",
    configurationRequest: "sayso.configure/configuration-request/1",
    configurationResponse: "sayso.configure/configuration-response/1",
    spotPriceRequest: "sayso.finance.oracle/spot-price-request/1",
    spotPriceResponse: "sayso.finance.oracle/spot-price-response/1",
  });

  const CONTENT_TYPE_BY_KEY = Object.freeze({
    configurationRequest: CONTENT_TYPES.configurationRequest,
    spotPriceRequest: CONTENT_TYPES.spotPriceRequest,
  });

  let cachedParams = null;
  const params = async () => {
    if (!cachedParams) cachedParams = await sayso.call("params.get", {});
    return cachedParams;
  };

  const protocolVersion = "0.1.0";
  const DEFAULT_QUOTE_SUFFIXES = ["USDC", "USDT", "USD", "EUR", "GBP", "BTC", "ETH"];

  const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
  const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
  const requestIdFrom = (content) => isRecord(content) && typeof content.requestId === "string" ? content.requestId : null;

  const normalizeMarket = (market) => {
    if (typeof market !== "string") return null;
    const trimmed = market.trim();
    if (!trimmed || /\s/.test(trimmed)) return null;
    const upper = trimmed.toUpperCase();
    const normalized = upper.replace("/", "-");
    if (/^[A-Z0-9]+-[A-Z0-9]+$/.test(normalized)) return normalized;
    if (normalized.includes("/") || normalized.includes("-")) return null;

    const quote = DEFAULT_QUOTE_SUFFIXES.find(
      (candidate) => normalized.endsWith(candidate) && normalized.length > candidate.length,
    );
    if (!quote) return null;
    return normalized.slice(0, -quote.length) + "-" + quote;
  };

  const parseConfigurationRequest = (value) => {
    if (!isRecord(value) || typeof value.requestId !== "string" || value.requestId.length === 0) return null;
    if (value.names !== undefined && !isStringArray(value.names)) return null;
    if (value.includeValues !== undefined && value.includeValues !== "public" && value.includeValues !== "none") return null;
    return value;
  };

  const isSpotPriceRequest = (value) =>
    isRecord(value) &&
    typeof value.requestId === "string" &&
    value.requestId.length > 0 &&
    Array.isArray(value.markets) &&
    value.markets.length > 0 &&
    value.markets.every((market) => typeof market === "string" && market.length > 0);

  const withOptionalValue = (variable, value) => value === undefined ? variable : { ...variable, value };

  const configurationVariables = (runtime) => [
    withOptionalValue(
      {
        name: "SAYSO_ORACLE_MARKETS",
        visibility: "public",
        description: "Comma-separated Coinbase spot markets this oracle supports.",
        valueType: "string",
        source: "runtime",
        required: true,
      },
      runtime.markets.join(","),
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

  const withoutValue = (variable) => {
    const { value: _value, ...rest } = variable;
    return rest;
  };

  const createConfigurationResponse = async (request) => {
    const runtime = (await params()).configuration;
    const requestedNames = request.names ? new Set(request.names) : null;
    const includeValues = request.includeValues ?? "public";
    const variables = configurationVariables(runtime)
      .filter((variable) => !requestedNames || requestedNames.has(variable.name))
      .map((variable) => includeValues === "none" ? withoutValue(variable) : variable);
    return {
      requestId: request.requestId,
      status: "ok",
      variables,
      generatedAt: await sayso.call("clock.nowIso", {}),
    };
  };

  const isTickerFresh = (snapshot, nowMs, staleAfterMs) =>
    isRecord(snapshot) && typeof snapshot.receivedAtMs === "number" && nowMs - snapshot.receivedAtMs <= staleAfterMs;

  const createSpotPriceResponse = async (request, message) => {
    const runtime = (await params()).configuration;
    const supportedMarkets = new Set(runtime.markets);
    const generatedAt = await sayso.call("clock.nowIso", {});
    const nowMs = Date.parse(generatedAt);
    const tickerCache = isRecord(message.tickerCache) ? message.tickerCache : {};
    return {
      requestId: request.requestId,
      status: "ok",
      generatedAt,
      results: request.markets.map((requestedMarket) => {
        const productId = normalizeMarket(requestedMarket);
        if (!productId || !supportedMarkets.has(productId)) {
          return {
            requestedMarket,
            ...(productId ? { productId } : {}),
            status: "error",
            error: {
              code: "unsupported-market",
              message: "Market " + requestedMarket + " is not supported by this oracle.",
            },
          };
        }

        const snapshot = tickerCache[productId];
        if (!isTickerFresh(snapshot, nowMs, runtime.staleAfterMs)) {
          return {
            requestedMarket,
            productId,
            status: "error",
            error: {
              code: "stale-or-unavailable",
              message: "No fresh Coinbase ticker is available for " + productId + ".",
            },
          };
        }

        return {
          requestedMarket,
          productId,
          status: "ok",
          price: snapshot.price,
          ...(snapshot.bestBid ? { bestBid: snapshot.bestBid } : {}),
          ...(snapshot.bestAsk ? { bestAsk: snapshot.bestAsk } : {}),
          asOf: snapshot.asOf,
          source: "coinbase.websocket.ticker",
          ...(snapshot.sequenceNum !== undefined ? { sequenceNum: snapshot.sequenceNum } : {}),
        };
      }),
    };
  };

  const coreError = (message, requestId) => ({
    contentType: CONTENT_TYPES.error,
    content: {
      code: "malformed",
      message,
      ...(requestId ? { requestId } : {}),
    },
  });

  const skillResponse = (input, p) => {
    const mode = input.request.include ?? "resolved";
    const includedSkillIds = p.skills.map((skill) => skill.skillId);
    const response = {
      status: "ok",
      agent: {
        ...p.skillPacket.agent,
        syncInboxId: input.agent.syncInboxId,
      },
      skill: p.resolvedSkill,
      content: "# SaySo Finance Oracle\n\nNo-payment SaySo agent that returns Coinbase spot ticker prices.",
      mediaType: "text/markdown",
    };
    if (mode === "skills" || mode === "all") {
      response.skills = p.skills;
      response.resolution = {
        mode,
        ...(input.request.skillIds ? { requestedSkillIds: input.request.skillIds } : {}),
        includedSkillIds,
        dependencyOrder: includedSkillIds,
      };
    }
    return response;
  };

  return {
    appId: "sayso.finance.oracle",
    runtime: {
      skillId: "sayso.runtime",
      abiVersion: "0.1.0",
    },
    hostOperations: ["params.get", "clock.nowIso"],
    capabilities: {
      network: {
        https: [],
        wss: [],
      },
    },
    skillPacket: async (_input) => (await params()).skillPacket,
    handleConnectionRequest: async (input) => {
      const p = await params();
      if (input.presentations && input.presentations.length > 0) {
        return {
          status: "error",
          supportedProtocolVersions: [protocolVersion],
          error: {
            code: "presentation-unsupported",
            message: "This oracle accepts any XMTP sender and does not advertise claim presentations.",
          },
        };
      }
      return {
        status: "ok",
        protocolVersion,
        supportedProtocolVersions: [protocolVersion],
        agent: {
          agentId: input.agent.agentId,
          syncInboxId: input.agent.syncInboxId,
          displayName: input.agent.displayName,
        },
        next: "sayso.protocol/skill-request/1",
        skillPacket: p.skillPacket,
      };
    },
    handleSkillRequest: async (input) => skillResponse(input, await params()),
    handleMessage: async (message) => {
      const contentType = message.contentType ?? CONTENT_TYPE_BY_KEY[message.key] ?? message.key;
      const content = message.content;
      switch (contentType) {
        case CONTENT_TYPES.configurationRequest: {
          const request = parseConfigurationRequest(content);
          if (!request) {
            const requestId = requestIdFrom(content);
            if (!requestId) return [coreError("Invalid configuration-request/1 payload.")];
            return [{
              contentType: CONTENT_TYPES.configurationResponse,
              content: {
                requestId,
                status: "error",
                error: {
                  code: "malformed",
                  message: "Invalid configuration-request/1 payload.",
                },
              },
            }];
          }
          return [{
            contentType: CONTENT_TYPES.configurationResponse,
            content: await createConfigurationResponse(request),
          }];
        }
        case CONTENT_TYPES.spotPriceRequest: {
          if (!isSpotPriceRequest(content)) return [coreError("Invalid spot-price-request/1 payload.")];
          return [{
            contentType: CONTENT_TYPES.spotPriceResponse,
            content: await createSpotPriceResponse(content, message),
          }];
        }
        default:
          return null;
      }
    },
    disconnect: async () => [{
      contentType: CONTENT_TYPES.disconnectAck,
      content: {
        action: "disconnect",
        status: "ok",
        details: { closed: ["connection_state"] },
      },
    }],
    forgetMe: async () => [{
      contentType: CONTENT_TYPES.disconnectAck,
      content: {
        action: "forget-me",
        status: "ok",
        details: { deleted: ["connection_state", "onboarding_state"] },
      },
    }],
  };
};

sayso.registerApplication(createApplication({ sayso }));
