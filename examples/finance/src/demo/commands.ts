export type DemoCommand =
  | { kind: "help" }
  | { kind: "quit" }
  | { kind: "pairs" }
  | { kind: "price"; markets: string[] };

const splitMarkets = (value: string) =>
  value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);

export const parseDemoCommand = (input: string): DemoCommand | null => {
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

export const formatHelp = () =>
  [
    "Commands:",
    "  pairs                  show supported oracle markets",
    "  price BTC/USD          request one market price",
    "  price BTC/USD ETH/USD  request multiple market prices",
    "  BTCUSD                 shorthand for price BTCUSD",
    "  help                   show this help",
    "  quit                   exit",
  ].join("\n");
