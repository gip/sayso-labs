import { isRecord } from "../sayso/validation.js";

export type CoinbaseTickerSnapshot = {
  productId: string;
  price: string;
  bestBid?: string;
  bestAsk?: string;
  asOf: string;
  sequenceNum?: number;
  receivedAtMs: number;
};

export type CoinbaseTickerCache = Map<string, CoinbaseTickerSnapshot>;

const optionalString = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : undefined);

export const parseCoinbaseTickerMessage = (
  message: unknown,
  receivedAtMs = Date.now(),
): CoinbaseTickerSnapshot[] => {
  if (!isRecord(message) || message.channel !== "ticker" || !Array.isArray(message.events)) return [];
  const timestamp = optionalString(message.timestamp);
  const sequenceNum = Number.isInteger(message.sequence_num) ? Number(message.sequence_num) : undefined;
  const snapshots: CoinbaseTickerSnapshot[] = [];

  for (const event of message.events) {
    if (!isRecord(event) || !Array.isArray(event.tickers)) continue;
    for (const ticker of event.tickers) {
      if (!isRecord(ticker)) continue;
      const productId = optionalString(ticker.product_id);
      const price = optionalString(ticker.price);
      if (!productId || !price) continue;
      snapshots.push({
        productId,
        price,
        bestBid: optionalString(ticker.best_bid),
        bestAsk: optionalString(ticker.best_ask),
        asOf: optionalString(ticker.time) ?? timestamp ?? new Date(receivedAtMs).toISOString(),
        sequenceNum,
        receivedAtMs,
      });
    }
  }

  return snapshots;
};

export const parseCoinbaseTickerData = (
  data: unknown,
  receivedAtMs = Date.now(),
): CoinbaseTickerSnapshot[] => {
  if (typeof data !== "string") return [];
  try {
    return parseCoinbaseTickerMessage(JSON.parse(data), receivedAtMs);
  } catch {
    return [];
  }
};

export const updateTickerCache = (
  cache: CoinbaseTickerCache,
  snapshots: CoinbaseTickerSnapshot[],
) => {
  for (const snapshot of snapshots) {
    cache.set(snapshot.productId, snapshot);
  }
};

export const isTickerFresh = (
  snapshot: CoinbaseTickerSnapshot | undefined,
  nowMs: number,
  staleAfterMs: number,
) => Boolean(snapshot && nowMs - snapshot.receivedAtMs <= staleAfterMs);
