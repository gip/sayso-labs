const createApplication = ({ sayso }) => {
  let cachedParams = null;
  const params = async () => {
    if (!cachedParams) cachedParams = await sayso.call("params.get", {});
    return cachedParams;
  };

  const write = async (message, channel = "stdout") => {
    await sayso.call("local.text.write", {
      message,
      channel,
      format: "plain",
    });
  };

  const splitMarkets = (value) =>
    value
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);

  const parseDemoCommand = (input) => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    if (lower === "help" || lower === "?") return { kind: "help" };
    if (lower === "quit" || lower === "exit" || lower === "q") return { kind: "quit" };
    if (lower === "pairs" || lower === "markets" || lower === "supported" || lower === "all") {
      return { kind: "pairs" };
    }
    if (lower.startsWith("price ")) {
      const markets = splitMarkets(trimmed.slice("price ".length));
      return markets.length > 0 ? { kind: "price", markets } : null;
    }
    const markets = splitMarkets(trimmed);
    return markets.length > 0 ? { kind: "price", markets } : null;
  };

  const formatHelp = () =>
    [
      "Commands:",
      "  pairs                  show supported oracle markets",
      "  price BTC/USD          request one market price",
      "  price BTC/USD ETH/USD  request multiple market prices",
      "  BTCUSD                 shorthand for price BTCUSD",
      "  help                   show this help",
      "  quit                   exit",
    ].join("\n");

  const formatSupportedMarkets = (markets) => {
    if (!Array.isArray(markets) || markets.length === 0) {
      return "No supported markets were advertised by this oracle.";
    }
    return `Supported markets: ${markets.join(", ")}`;
  };

  const formatSpotResult = (result) => {
    if (result.status === "error") {
      const product = result.productId ? ` (${result.productId})` : "";
      return `${result.requestedMarket}${product}: ${result.error.code}: ${result.error.message}`;
    }
    const bidAsk =
      result.bestBid || result.bestAsk
        ? ` bid=${result.bestBid ?? "n/a"} ask=${result.bestAsk ?? "n/a"}`
        : "";
    return `${result.requestedMarket} (${result.productId}): ${result.price}${bidAsk} asOf=${result.asOf}`;
  };

  const formatSpotPriceResponse = (response) => response.results.map(formatSpotResult).join("\n");

  const writeSupportedMarkets = async () => {
    const markets = await sayso.call("demo.supportedMarkets", {});
    await write(formatSupportedMarkets(markets));
  };

  const writeError = async (error) => {
    await write(error && error.message ? String(error.message) : String(error), "stderr");
  };

  return {
    appId: "sayso.finance.demo",
    runtime: {
      skillId: "sayso.runtime",
      abiVersion: "0.1.0",
    },
    hostOperations: [
      "params.get",
      "local.text.write",
      "local.text.read",
      "demo.connect",
      "demo.supportedMarkets",
      "demo.spotPrices",
    ],
    capabilities: {
      network: {
        https: [],
        wss: [],
      },
    },
    run: async () => {
      const p = await params();
      await write("SaySo demo client running");
      await write(`Wallet: ${p.walletAddress}`);
      await write(`Inbox ID: ${p.inboxId}`);
      await write(`Environment: ${p.env}`);
      await write(`Oracle: ${p.oracle}`);

      const connection = await sayso.call("demo.connect", {});
      await write(`Connected to ${connection.agent.displayName} (${connection.agent.agentId})`);

      try {
        await writeSupportedMarkets();
      } catch (error) {
        await write(`Unable to read supported markets: ${error && error.message ? error.message : String(error)}`, "stderr");
      }

      await write(formatHelp());
      for (;;) {
        const localInput = await sayso.call("local.text.read", { prompt: "sayso-demo> " });
        if (localInput.status !== "ok") {
          if (localInput.message) await write(localInput.message, "stderr");
          return { status: localInput.status };
        }
        const command = parseDemoCommand(localInput.value);
        if (!command) continue;
        if (command.kind === "quit") return { status: "ok" };
        if (command.kind === "help") {
          await write(formatHelp());
          continue;
        }
        if (command.kind === "pairs") {
          try {
            await writeSupportedMarkets();
          } catch (error) {
            await writeError(error);
          }
          continue;
        }
        try {
          const response = await sayso.call("demo.spotPrices", { markets: command.markets });
          await write(formatSpotPriceResponse(response));
        } catch (error) {
          await writeError(error);
        }
      }
    },
  };
};

sayso.registerApplication(createApplication({ sayso }));
