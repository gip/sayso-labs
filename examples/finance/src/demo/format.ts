import type { SpotPriceResponsePayload, SpotPriceResult } from "../sayso/types.js";

export const formatSupportedMarkets = (markets: string[]) => {
  if (markets.length === 0) return "No supported markets were advertised by this oracle.";
  return `Supported markets: ${markets.join(", ")}`;
};

const formatSpotResult = (result: SpotPriceResult) => {
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

export const formatSpotPriceResponse = (response: SpotPriceResponsePayload) =>
  response.results.map(formatSpotResult).join("\n");
