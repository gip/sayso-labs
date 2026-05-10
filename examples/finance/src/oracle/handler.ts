import type { CoinbaseTickerCache } from "../coinbase/ticker.js";
import { isTickerFresh } from "../coinbase/ticker.js";
import type { SpotPriceRequestPayload, SpotPriceResponsePayload } from "../sayso/types.js";
import { isRecord } from "../sayso/validation.js";
import { normalizeMarket } from "./markets.js";

export const isSpotPriceRequest = (value: unknown): value is SpotPriceRequestPayload =>
  isRecord(value) &&
  typeof value.requestId === "string" &&
  value.requestId.length > 0 &&
  Array.isArray(value.markets) &&
  value.markets.length > 0 &&
  value.markets.every((market) => typeof market === "string" && market.length > 0);

export const createSpotPriceResponse = (
  request: SpotPriceRequestPayload,
  input: {
    supportedMarkets: Set<string>;
    tickerCache: CoinbaseTickerCache;
    staleAfterMs: number;
    now?: Date;
  },
): SpotPriceResponsePayload => {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  return {
    requestId: request.requestId,
    status: "ok",
    generatedAt: now.toISOString(),
    results: request.markets.map((requestedMarket) => {
      const productId = normalizeMarket(requestedMarket);
      if (!productId || !input.supportedMarkets.has(productId)) {
        return {
          requestedMarket,
          ...(productId ? { productId } : {}),
          status: "error" as const,
          error: {
            code: "unsupported-market" as const,
            message: `Market ${requestedMarket} is not supported by this oracle.`,
          },
        };
      }

      const snapshot = input.tickerCache.get(productId);
      if (!snapshot || !isTickerFresh(snapshot, nowMs, input.staleAfterMs)) {
        return {
          requestedMarket,
          productId,
          status: "error" as const,
          error: {
            code: "stale-or-unavailable" as const,
            message: `No fresh Coinbase ticker is available for ${productId}.`,
          },
        };
      }

      return {
        requestedMarket,
        productId,
        status: "ok" as const,
        price: snapshot.price,
        ...(snapshot.bestBid ? { bestBid: snapshot.bestBid } : {}),
        ...(snapshot.bestAsk ? { bestAsk: snapshot.bestAsk } : {}),
        asOf: snapshot.asOf,
        source: "coinbase.websocket.ticker" as const,
        ...(snapshot.sequenceNum !== undefined ? { sequenceNum: snapshot.sequenceNum } : {}),
      };
    }),
  };
};
