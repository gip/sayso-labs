export const DEFAULT_QUOTE_SUFFIXES = [
  "USDC",
  "USDT",
  "USD",
  "EUR",
  "GBP",
  "BTC",
  "ETH",
] as const;

export const normalizeMarket = (market: string): string | null => {
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
  return `${normalized.slice(0, -quote.length)}-${quote}`;
};

export type ParsedMarketList = {
  markets: string[];
  invalid: string[];
};

export const parseMarketList = (value: string): ParsedMarketList => {
  const markets: string[] = [];
  const invalid: string[] = [];
  for (const raw of value.split(",")) {
    const item = raw.trim();
    if (!item) continue;
    const normalized = normalizeMarket(item);
    if (normalized) markets.push(normalized);
    else invalid.push(item);
  }
  return {
    markets: [...new Set(markets)],
    invalid,
  };
};

export const parseConfiguredMarkets = (value: string): string[] => {
  return parseMarketList(value).markets;
};

export const formatConfiguredMarkets = (markets: Iterable<string>) =>
  [...markets].join(",");
