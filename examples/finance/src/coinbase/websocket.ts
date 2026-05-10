import { signCoinbaseWebSocketJwt } from "./jwt.js";
import { parseCoinbaseTickerData, updateTickerCache, type CoinbaseTickerCache } from "./ticker.js";

export type CoinbaseWebSocketStatus = {
  connected: boolean;
  reconnectAttempts: number;
  lastError?: string;
  lastMessageAt?: string;
};

export type CoinbaseWebSocketAuth = {
  keyName: string;
  privateKey: string;
};

export type CoinbaseTickerWebSocketOptions = {
  url: string;
  products: string[];
  auth?: CoinbaseWebSocketAuth;
  tickerCache: CoinbaseTickerCache;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  onStatus?: (status: CoinbaseWebSocketStatus) => void;
};

export const createCoinbaseSubscribeMessage = (input: {
  channel: "ticker" | "heartbeats";
  products: string[];
  auth?: CoinbaseWebSocketAuth;
}) => {
  const message: {
    type: "subscribe";
    channel: "ticker" | "heartbeats";
    product_ids: string[];
    jwt?: string;
  } = {
    type: "subscribe",
    channel: input.channel,
    product_ids: input.products,
  };
  if (input.auth) {
    message.jwt = signCoinbaseWebSocketJwt({
      keyName: input.auth.keyName,
      privateKey: input.auth.privateKey,
    });
  }
  return message;
};

const messageDataToString = (data: unknown) => {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  return null;
};

export class CoinbaseTickerWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private reconnectAttempts = 0;
  private connected = false;
  private lastError: string | undefined;
  private lastMessageAt: string | undefined;

  constructor(private readonly options: CoinbaseTickerWebSocketOptions) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.connect();
  }

  stop() {
    this.running = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    this.emitStatus();
  }

  status(): CoinbaseWebSocketStatus {
    return {
      connected: this.connected,
      reconnectAttempts: this.reconnectAttempts,
      ...(this.lastError ? { lastError: this.lastError } : {}),
      ...(this.lastMessageAt ? { lastMessageAt: this.lastMessageAt } : {}),
    };
  }

  private connect() {
    if (!this.running) return;
    if (typeof WebSocket === "undefined") {
      throw new Error("Global WebSocket is not available in this Node.js runtime.");
    }

    const ws = new WebSocket(this.options.url);
    this.ws = ws;
    ws.addEventListener("open", () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.lastError = undefined;
      this.emitStatus();
      this.subscribe(ws, "ticker");
      this.subscribe(ws, "heartbeats");
    });
    ws.addEventListener("message", (event) => {
      const text = messageDataToString(event.data);
      if (!text) return;
      const receivedAtMs = Date.now();
      const updates = parseCoinbaseTickerData(text, receivedAtMs);
      if (updates.length > 0) {
        updateTickerCache(this.options.tickerCache, updates);
      }
      this.lastMessageAt = new Date(receivedAtMs).toISOString();
      this.emitStatus();
    });
    ws.addEventListener("error", () => {
      this.lastError = "Coinbase WebSocket error.";
      this.emitStatus();
    });
    ws.addEventListener("close", () => {
      this.connected = false;
      this.emitStatus();
      this.scheduleReconnect();
    });
  }

  private subscribe(ws: WebSocket, channel: "ticker" | "heartbeats") {
    const message = createCoinbaseSubscribeMessage({
      channel,
      products: this.options.products,
      auth: this.options.auth,
    });
    ws.send(JSON.stringify(message));
  }

  private scheduleReconnect() {
    if (!this.running || this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    const baseMs = this.options.reconnectBaseMs ?? 1_000;
    const maxMs = this.options.reconnectMaxMs ?? 30_000;
    const delayMs = Math.min(maxMs, baseMs * 2 ** Math.min(this.reconnectAttempts - 1, 8));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delayMs);
  }

  private emitStatus() {
    this.options.onStatus?.(this.status());
  }
}
