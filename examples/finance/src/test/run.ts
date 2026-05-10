import assert from "node:assert/strict";
import { contentTypesAreEqual } from "@xmtp/content-type-primitives";
import { parseCoinbaseTickerMessage, type CoinbaseTickerCache } from "../coinbase/ticker.js";
import { createCoinbaseSubscribeMessage } from "../coinbase/websocket.js";
import { parseDemoCommand } from "../demo/commands.js";
import { formatSpotPriceResponse, formatSupportedMarkets } from "../demo/format.js";
import { createQuickJsDemoApplication, DEMO_RUNTIME_APP_FILENAME, readDemoRuntimeAppSource } from "../demo/quickjs.js";
import { CONTENT_TYPES, contentTypeNameFromKey } from "../sayso/contentTypes.js";
import { saysoCodecs } from "../sayso/codecs.js";
import type { SpotPriceRequestPayload, SpotPriceResponsePayload } from "../sayso/types.js";
import { createOracleConfigurationResponse } from "../oracle/configuration.js";
import { createSpotPriceResponse, isSpotPriceRequest } from "../oracle/handler.js";
import { normalizeMarket, parseConfiguredMarkets, parseMarketList } from "../oracle/markets.js";
import { createOracleResolvedSkill, createOracleSkillPacket, oracleSkillDocuments } from "../oracle/skill.js";
import { createOracleNetworkRegistration } from "../oracle/networkRegistration.js";
import { createNativeOracleApplication } from "../oracle/application.js";
import { createQuickJsOracleApplication, ORACLE_RUNTIME_APP_FILENAME, readOracleRuntimeAppSource } from "../oracle/quickjs.js";
import { createQuickJsApplication, type JsonValue } from "../sayso/quickjs.js";

assert.equal(contentTypeNameFromKey("spotPriceRequest"), "sayso.finance.oracle/spot-price-request/1");
assert.equal(contentTypeNameFromKey("spotPriceResponse"), "sayso.finance.oracle/spot-price-response/1");
assert.equal(contentTypeNameFromKey("registrationSubmit"), "sayso.network/registration-submit/1");
assert.equal(contentTypeNameFromKey("registrationResult"), "sayso.network/registration-result/1");

assert.equal(normalizeMarket("BTC/USD"), "BTC-USD");
assert.equal(normalizeMarket("btc-usd"), "BTC-USD");
assert.equal(normalizeMarket("BTCUSD"), "BTC-USD");
assert.equal(normalizeMarket("ethusdc"), "ETH-USDC");
assert.equal(normalizeMarket(" XPR/USD "), "XPR-USD");
assert.equal(normalizeMarket(""), null);
assert.equal(normalizeMarket("BTC USD"), null);
assert.equal(normalizeMarket("BTC/USD/EXTRA"), null);
assert.deepEqual(parseConfiguredMarkets("BTC/USD,btc-usd,ETHUSD"), ["BTC-USD", "ETH-USD"]);
assert.deepEqual(parseMarketList("BTC/USD, bad market, ethusdc"), {
  markets: ["BTC-USD", "ETH-USDC"],
  invalid: ["bad market"],
});
assert.deepEqual(parseDemoCommand("pairs"), { kind: "pairs" });
assert.deepEqual(parseDemoCommand("all"), { kind: "pairs" });
assert.deepEqual(parseDemoCommand("price BTC/USD ETHUSD"), { kind: "price", markets: ["BTC/USD", "ETHUSD"] });
assert.deepEqual(parseDemoCommand("BTCUSD"), { kind: "price", markets: ["BTCUSD"] });
assert.deepEqual(parseDemoCommand("quit"), { kind: "quit" });
assert.equal(parseDemoCommand("   "), null);
assert.equal(formatSupportedMarkets(["BTC-USD", "ETH-USD"]), "Supported markets: BTC-USD, ETH-USD");

const tickerUpdates = parseCoinbaseTickerMessage(
  {
    channel: "ticker",
    timestamp: "2026-05-05T20:30:37.167Z",
    sequence_num: 42,
    events: [
      {
        type: "snapshot",
        tickers: [
          {
            type: "ticker",
            product_id: "BTC-USD",
            price: "65000.01",
            best_bid: "64999.99",
            best_ask: "65000.02",
          },
        ],
      },
    ],
  },
  Date.parse("2026-05-05T20:30:38.000Z"),
);
assert.deepEqual(tickerUpdates, [
  {
    productId: "BTC-USD",
    price: "65000.01",
    bestBid: "64999.99",
    bestAsk: "65000.02",
    asOf: "2026-05-05T20:30:37.167Z",
    sequenceNum: 42,
    receivedAtMs: Date.parse("2026-05-05T20:30:38.000Z"),
  },
]);

assert.deepEqual(createCoinbaseSubscribeMessage({ channel: "ticker", products: ["BTC-USD"] }), {
  type: "subscribe",
  channel: "ticker",
  product_ids: ["BTC-USD"],
});

const tickerCache: CoinbaseTickerCache = new Map();
tickerCache.set("BTC-USD", tickerUpdates[0]!);
tickerCache.set("ETH-USD", {
  productId: "ETH-USD",
  price: "3100.00",
  asOf: "2026-05-05T20:29:00.000Z",
  receivedAtMs: Date.parse("2026-05-05T20:29:00.000Z"),
});
const spotResponse = createSpotPriceResponse(
  { requestId: "spot_1", markets: ["BTC/USD", "ETH/USD", "DOGE/USD", "bad market"] },
  {
    supportedMarkets: new Set(["BTC-USD", "ETH-USD"]),
    tickerCache,
    staleAfterMs: 30_000,
    now: new Date("2026-05-05T20:30:40.000Z"),
  },
);
assert.equal(spotResponse.status, "ok");
assert.equal(spotResponse.results.length, 4);
assert.deepEqual(spotResponse.results[0], {
  requestedMarket: "BTC/USD",
  productId: "BTC-USD",
  status: "ok",
  price: "65000.01",
  bestBid: "64999.99",
  bestAsk: "65000.02",
  asOf: "2026-05-05T20:30:37.167Z",
  source: "coinbase.websocket.ticker",
  sequenceNum: 42,
});
assert.match(formatSpotPriceResponse(spotResponse), /BTC\/USD \(BTC-USD\): 65000\.01 bid=64999\.99 ask=65000\.02/);
assert.match(formatSpotPriceResponse(spotResponse), /ETH\/USD \(ETH-USD\): stale-or-unavailable:/);
assert.equal(spotResponse.results[1]?.status, "error");
assert.equal(spotResponse.results[1]?.status === "error" ? spotResponse.results[1].error.code : null, "stale-or-unavailable");
assert.equal(spotResponse.results[2]?.status, "error");
assert.equal(spotResponse.results[2]?.status === "error" ? spotResponse.results[2].error.code : null, "unsupported-market");
assert.equal(spotResponse.results[3]?.status, "error");
assert.equal(isSpotPriceRequest({ requestId: "spot_2", markets: ["BTC/USD"] }), true);
assert.equal(isSpotPriceRequest({ requestId: "spot_2", markets: [] }), false);

const configurationResponse = createOracleConfigurationResponse(
  { requestId: "config_1" },
  {
    markets: new Set(["BTC-USD", "ETH-USD"]),
    staleAfterMs: 30_000,
    coinbaseWsUrl: "wss://advanced-trade-ws.coinbase.com",
    coinbaseAuthenticated: false,
    xmtpEnv: "dev",
    networkAgent: "0xc9f639a95813c834967fb8a38f749ea5f0b5cdd9",
    debug: "info",
    dbDir: ".data/xmtp",
  },
  "2026-05-05T20:30:00.000Z",
);
assert.equal(configurationResponse.status, "ok");
if (configurationResponse.status !== "ok") throw new Error("expected configuration response");
assert.deepEqual(
  configurationResponse.variables.map((variable) => variable.name),
  [
    "SAYSO_ORACLE_MARKETS",
    "SAYSO_ORACLE_STALE_AFTER_MS",
    "COINBASE_WS_URL",
    "COINBASE_AUTH_MODE",
    "XMTP_ENV",
    "SAYSO_NETWORK_AGENT",
    "XMTP_DB_DIR",
    "DEBUG",
    "COINBASE_API_KEY_NAME",
    "COINBASE_API_PRIVATE_KEY",
    "XMTP_PRIVATE_KEY",
    "XMTP_DB_ENCRYPTION_KEY",
  ],
);
assert.equal(configurationResponse.variables.find((variable) => variable.name === "SAYSO_ORACLE_MARKETS")?.value, "BTC-USD,ETH-USD");
assert.equal(configurationResponse.variables.find((variable) => variable.name === "COINBASE_AUTH_MODE")?.value, "public");
assert.equal(configurationResponse.variables.find((variable) => variable.name === "COINBASE_API_KEY_NAME")?.required, false);
assert.equal(configurationResponse.variables.find((variable) => variable.name === "COINBASE_API_PRIVATE_KEY")?.required, false);
for (const name of ["COINBASE_API_KEY_NAME", "COINBASE_API_PRIVATE_KEY", "XMTP_PRIVATE_KEY", "XMTP_DB_ENCRYPTION_KEY"]) {
  assert.equal(
    Object.prototype.hasOwnProperty.call(configurationResponse.variables.find((variable) => variable.name === name) ?? {}, "value"),
    false,
  );
}

const noValuesConfigurationResponse = createOracleConfigurationResponse(
  { requestId: "config_2", includeValues: "none", names: ["SAYSO_ORACLE_MARKETS", "COINBASE_API_KEY_NAME"] },
  {
    markets: new Set(["BTC-USD"]),
    staleAfterMs: 30_000,
    coinbaseWsUrl: "wss://advanced-trade-ws.coinbase.com",
    coinbaseAuthenticated: true,
    xmtpEnv: "production",
    dbDir: ".data/xmtp",
  },
);
assert.equal(noValuesConfigurationResponse.status, "ok");
if (noValuesConfigurationResponse.status !== "ok") throw new Error("expected no-values configuration response");
assert.equal(
  noValuesConfigurationResponse.variables.some((variable) => Object.prototype.hasOwnProperty.call(variable, "value")),
  false,
);

const spotRequest: SpotPriceRequestPayload = {
  requestId: "spot_codec",
  markets: ["BTC/USD"],
};
const spotRequestCodec = saysoCodecs.find((codec) =>
  contentTypesAreEqual(codec.contentType, CONTENT_TYPES.spotPriceRequest),
);
assert.ok(spotRequestCodec);
assert.deepEqual(spotRequestCodec.decode(spotRequestCodec.encode(spotRequest)), spotRequest);

const spotCodecResponse: SpotPriceResponsePayload = {
  requestId: "spot_codec",
  status: "ok",
  generatedAt: "2026-05-05T20:30:00.000Z",
  results: [
    {
      requestedMarket: "BTC/USD",
      productId: "BTC-USD",
      status: "ok",
      price: "65000.01",
      bestBid: "64999.99",
      bestAsk: "65000.02",
      asOf: "2026-05-05T20:30:00.000Z",
      source: "coinbase.websocket.ticker",
      sequenceNum: 42,
    },
  ],
};
const spotResponseCodec = saysoCodecs.find((codec) =>
  contentTypesAreEqual(codec.contentType, CONTENT_TYPES.spotPriceResponse),
);
assert.ok(spotResponseCodec);
assert.deepEqual(spotResponseCodec.decode(spotResponseCodec.encode(spotCodecResponse)), spotCodecResponse);

const skillPacket = createOracleSkillPacket({
  agentId: "sayso-oracle-test",
  syncInboxId: "inbox",
  displayName: "SaySo Oracle",
});
assert.deepEqual(
  skillPacket.skills.map((skill) => skill.skillId),
  ["sayso.protocol", "sayso.runtime", "sayso.configure", "sayso.finance.oracle"],
);
assert.match(skillPacket.skills[0]?.content ?? "", /# SaySo Protocol/);
assert.match(skillPacket.skills[1]?.content ?? "", /# SaySo Runtime/);
assert.match(skillPacket.skills[2]?.content ?? "", /# SaySo Configure/);
assert.match(skillPacket.skills[3]?.content ?? "", /# SaySo Finance Oracle/);
assert.ok(createOracleResolvedSkill("inbox").capabilities.some((capability) => capability.capabilityId === "sayso.runtime.application"));
assert.ok(createOracleResolvedSkill("inbox").capabilities.some((capability) => capability.capabilityId === "oracle.spot-price"));
assert.equal((createOracleResolvedSkill("inbox").runtime as { applications?: Array<{ appId: string }> }).applications?.[0]?.appId, "sayso.finance.oracle");
assert.equal(oracleSkillDocuments().length, 4);

const networkRegistration = createOracleNetworkRegistration({
  syncInboxId: "inbox_live",
  walletAddress: "0x44b4ec2bb43ab460f951d00d945a8240653f4f6b",
});
assert.equal(networkRegistration.agent.agentId, "0x44b4ec2bb43ab460f951d00d945a8240653f4f6b-sayso-oracle");
assert.equal(networkRegistration.agent.syncInboxId, "inbox_live");
assert.equal(networkRegistration.visibility, "public");
assert.equal(networkRegistration.profile?.skillDisclosure, "include-skill-packet");
assert.equal(networkRegistration.profile?.skillPacket?.agent.syncInboxId, "inbox_live");
assert.deepEqual(
  networkRegistration.profile?.skillPacket?.skills.map((skill) => skill.skillId),
  ["sayso.protocol", "sayso.runtime", "sayso.configure", "sayso.finance.oracle"],
);

const signerPrivateKeyMaterial = "eca791732d725a868c78ddefbb7868c6";
const quickJsLocalTextWrites: Array<{ message: string; channel?: string; format?: "plain" | "markdown" }> = [];
const quickJsHost = await createQuickJsApplication(
  `
  sayso.registerApplication({
    appId: "sayso.test.finance",
    runtime: { skillId: "sayso.runtime", abiVersion: "0.1.0" },
    hostOperations: [
      "params.get",
      "clock.nowIso",
      "id.generate",
      "signer.getAccount",
      "signer.signMessage",
      "local.text.write",
      "local.text.read"
    ],
    capabilities: {
      network: {
        https: ["https://api.example"],
        wss: ["wss://socket.example"],
      },
    },
    echo: async (input) => ({
      input,
      params: await sayso.call("params.get", {}),
      now: await sayso.call("clock.nowIso", {}),
      id: await sayso.call("id.generate", {}),
      account: await sayso.call("signer.getAccount", {}),
      localWrite: await sayso.call("local.text.write", {
        message: "hello local",
        channel: "status",
        format: "plain",
      }),
      localRead: await sayso.call("local.text.read", {
        prompt: "Name?",
        defaultValue: "Ada",
        multiline: false,
        secret: false,
        timeoutMs: 1000,
      }),
      globals: {
        fetch: typeof fetch,
        WebSocket: typeof WebSocket,
        saysoFrozen: Object.isFrozen(sayso),
      },
    }),
    sign: async () => await sayso.call("signer.signMessage", { message: "hello" }),
    invalidLocalWrite: async () => await sayso.call("local.text.write", { message: 7 }),
    invalidLocalRead: async () => await sayso.call("local.text.read", { timeoutMs: -1 }),
    badJson: async () => await sayso.call("clock.nowIso", { bad: () => null }),
    hostObject: async () => await sayso.call("test.hostObject", {}),
  });
  `,
  {
    params: { publicValue: "visible" },
    clock: { now: () => new Date("2026-05-06T12:00:00.000Z") },
    idGenerator: () => "id_finance_quickjs",
    signer: {
      getAccount: () => ({ kind: "ethereum", address: "0x44b4ec2bb43ab460f951d00d945a8240653f4f6b" }),
      signMessage: ({ message }) => {
        void signerPrivateKeyMaterial;
        return {
          account: { kind: "ethereum", address: "0x44b4ec2bb43ab460f951d00d945a8240653f4f6b" },
          message,
          signature: "0x1234",
          signatureEncoding: "hex",
        };
      },
    },
    localText: {
      write: (input) => {
        quickJsLocalTextWrites.push(input);
      },
      read: (input) => ({
        status: "ok",
        value: input.defaultValue ?? "",
      }),
    },
    operations: {
      "test.hostObject": () => new Date("2026-05-06T12:00:00.000Z") as unknown as JsonValue,
    },
  },
);
assert.equal(quickJsHost.application.appId, "sayso.test.finance");
assert.deepEqual(quickJsHost.application.runtime, { skillId: "sayso.runtime", abiVersion: "0.1.0" });
assert.deepEqual(await quickJsHost.call("echo", { requestId: "host_1" }), {
  input: { requestId: "host_1" },
  params: { publicValue: "visible" },
  now: "2026-05-06T12:00:00.000Z",
  id: "id_finance_quickjs",
  account: { kind: "ethereum", address: "0x44b4ec2bb43ab460f951d00d945a8240653f4f6b" },
  localWrite: { status: "ok" },
  localRead: { status: "ok", value: "Ada" },
  globals: {
    fetch: "undefined",
    WebSocket: "undefined",
    saysoFrozen: true,
  },
});
assert.deepEqual(quickJsLocalTextWrites, [
  {
    message: "hello local",
    channel: "status",
    format: "plain",
  },
]);
assert.equal(JSON.stringify(await quickJsHost.call("sign", {})).includes(signerPrivateKeyMaterial), false);
await assert.rejects(() => quickJsHost.call("invalidLocalWrite", {}), /local\.text\.write requires a string message/);
await assert.rejects(() => quickJsHost.call("invalidLocalRead", {}), /local\.text\.read timeoutMs must be a non-negative integer/);
await assert.rejects(() => quickJsHost.call("badJson", {}), /JSON-serializable/);
await assert.rejects(() => quickJsHost.call("hostObject", {}), /JSON-serializable/);
quickJsHost.dispose();

const quickJsMissingLocalText = await createQuickJsApplication(
  `
  sayso.registerApplication({
    appId: "sayso.test.local-missing",
    write: async () => await sayso.call("local.text.write", { message: "hello" }),
    read: async () => await sayso.call("local.text.read", {}),
  });
  `,
);
await assert.rejects(() => quickJsMissingLocalText.call("write", {}), /local\.text\.write is not configured/);
await assert.rejects(() => quickJsMissingLocalText.call("read", {}), /local\.text\.read is not configured/);
quickJsMissingLocalText.dispose();

let quickJsNetworkOpened = false;
const quickJsDeniedNetwork = await createQuickJsApplication(
  `
  sayso.registerApplication({
    appId: "sayso.test.network",
    capabilities: { network: { https: ["https://api.example"] } },
    request: async () => await sayso.call("network.https.request", { url: "https://api.example/path" }),
  });
  `,
  {
    networkPolicy: () => false,
    network: {
      httpsRequest: () => {
        quickJsNetworkOpened = true;
        return { ok: true };
      },
    },
  },
);
await assert.rejects(() => quickJsDeniedNetwork.call("request", {}), /denied/);
assert.equal(quickJsNetworkOpened, false);
quickJsDeniedNetwork.dispose();

const forbiddenRuntimeAppPatterns = [
  ["static import", /^\s*import\s/m],
  ["dynamic import", /\bimport\s*\(/],
  ["require", /\brequire\s*\(/],
  ["fetch", /\bfetch\s*\(/],
  ["WebSocket", /\bnew\s+WebSocket\b/],
  ["XMLHttpRequest", /\bnew\s+XMLHttpRequest\b/],
  ["EventSource", /\bnew\s+EventSource\b/],
  ["importScripts", /\bimportScripts\s*\(/],
  ["process", /\bprocess\s*\.\s*env|\bglobalThis\s*\.\s*process/],
  ["Buffer", /\bBuffer\s*[.(]/],
] as const;

const runtimeAppSource = readOracleRuntimeAppSource();
assert.ok(runtimeAppSource.includes("const createApplication = ({ sayso })"));
assert.ok(runtimeAppSource.includes("sayso.registerApplication(createApplication({ sayso }))"));
for (const [name, pattern] of forbiddenRuntimeAppPatterns) {
  assert.equal(pattern.test(runtimeAppSource), false, `${ORACLE_RUNTIME_APP_FILENAME} contains ${name}`);
}
const standaloneRuntimeApp = await createQuickJsApplication(runtimeAppSource);
assert.equal(standaloneRuntimeApp.application.appId, "sayso.finance.oracle");
assert.deepEqual(standaloneRuntimeApp.application.runtime, { skillId: "sayso.runtime", abiVersion: "0.1.0" });
standaloneRuntimeApp.dispose();

const demoRuntimeAppSource = readDemoRuntimeAppSource();
assert.ok(demoRuntimeAppSource.includes("const createApplication = ({ sayso })"));
assert.ok(demoRuntimeAppSource.includes("sayso.registerApplication(createApplication({ sayso }))"));
for (const [name, pattern] of forbiddenRuntimeAppPatterns) {
  assert.equal(pattern.test(demoRuntimeAppSource), false, `${DEMO_RUNTIME_APP_FILENAME} contains ${name}`);
}
const standaloneDemoRuntimeApp = await createQuickJsApplication(demoRuntimeAppSource);
assert.equal(standaloneDemoRuntimeApp.application.appId, "sayso.finance.demo");
assert.deepEqual(standaloneDemoRuntimeApp.application.runtime, { skillId: "sayso.runtime", abiVersion: "0.1.0" });
standaloneDemoRuntimeApp.dispose();

const demoReads = ["pairs", "price BTC/USD ETH/USD", "help", "quit"];
const demoWrites: Array<{ message: string; channel?: string }> = [];
let demoConnectCount = 0;
let demoMarketsCount = 0;
let demoSpotMarkets: string[] | null = null;
const quickJsDemo = await createQuickJsDemoApplication({
  params: {
    walletAddress: "0x44b4ec2bb43ab460f951d00d945a8240653f4f6b",
    inboxId: "inbox_demo",
    env: "dev",
    oracle: "oracle_demo",
  },
  localText: {
    write: ({ message, channel }) => {
      demoWrites.push({ message, ...(channel ? { channel } : {}) });
    },
    read: () => ({ status: "ok", value: demoReads.shift() ?? "quit" }),
  },
  host: {
    connect: () => {
      demoConnectCount += 1;
      return {
        status: "ok",
        protocolVersion: "0.1.0",
        supportedProtocolVersions: ["0.1.0"],
        agent: {
          agentId: "sayso-oracle-demo",
          syncInboxId: "inbox_oracle",
          displayName: "SaySo Oracle",
        },
        next: "sayso.protocol/skill-request/1",
        skillPacket: createOracleSkillPacket({
          agentId: "sayso-oracle-demo",
          syncInboxId: "inbox_oracle",
          displayName: "SaySo Oracle",
        }),
      };
    },
    supportedMarkets: () => {
      demoMarketsCount += 1;
      return ["BTC-USD", "ETH-USD"];
    },
    spotPrices: ({ markets }) => {
      demoSpotMarkets = markets;
      return {
        requestId: "spot_demo",
        status: "ok",
        generatedAt: "2026-05-05T20:30:00.000Z",
        results: [
          {
            requestedMarket: markets[0] ?? "BTC/USD",
            productId: "BTC-USD",
            status: "ok",
            price: "65000.01",
            bestBid: "64999.99",
            bestAsk: "65000.02",
            asOf: "2026-05-05T20:30:00.000Z",
            source: "coinbase.websocket.ticker",
            sequenceNum: 42,
          },
        ],
      };
    },
  },
});
assert.deepEqual(await quickJsDemo.run(), { status: "ok" });
assert.equal(demoConnectCount, 1);
assert.equal(demoMarketsCount, 2);
assert.deepEqual(demoSpotMarkets, ["BTC/USD", "ETH/USD"]);
assert.ok(demoWrites.some((entry) => entry.message === "SaySo demo client running"));
assert.ok(demoWrites.some((entry) => entry.message === "Supported markets: BTC-USD, ETH-USD"));
assert.ok(demoWrites.some((entry) => entry.message.includes("BTC/USD (BTC-USD): 65000.01")));
assert.ok(demoWrites.some((entry) => entry.message.includes("Commands:")));
quickJsDemo.dispose();

const runtimeOracleAgent = {
  agentId: "sayso-oracle-test",
  syncInboxId: "inbox_runtime",
  displayName: "SaySo Oracle",
};
const runtimeOracleConfiguration = {
  markets: new Set(["BTC-USD", "ETH-USD"]),
  staleAfterMs: 30_000,
  coinbaseWsUrl: "wss://advanced-trade-ws.coinbase.com",
  coinbaseAuthenticated: false,
  xmtpEnv: "dev",
  networkAgent: "xmtp_inbox_network",
  debug: "info",
  dbDir: ".data/xmtp",
};
const nativeOracleClockValues = [
  "2026-05-05T20:30:00.000Z",
  "2026-05-05T20:30:40.000Z",
];
const quickJsOracleClockValues = [
  "2026-05-05T20:30:00.000Z",
  "2026-05-05T20:30:40.000Z",
];
const nativeOracle = createNativeOracleApplication({
  walletAddress: "0x44b4ec2bb43ab460f951d00d945a8240653f4f6b",
  configuration: runtimeOracleConfiguration,
  clock: {
    now: () => new Date(nativeOracleClockValues.shift() ?? "2026-05-05T20:30:40.000Z"),
  },
});
const quickJsOracle = await createQuickJsOracleApplication({
  agent: runtimeOracleAgent,
  configuration: runtimeOracleConfiguration,
  host: {
    clock: {
      now: () => new Date(quickJsOracleClockValues.shift() ?? "2026-05-05T20:30:40.000Z"),
    },
  },
});
assert.deepEqual(
  await quickJsOracle.handleConnectionRequest({
    agent: runtimeOracleAgent,
    senderInboxId: "sender_runtime",
    conversationId: "conversation_runtime",
    presentations: undefined,
  }),
  await nativeOracle.handleConnectionRequest({
    agent: runtimeOracleAgent,
    senderInboxId: "sender_runtime",
    conversationId: "conversation_runtime",
    presentations: undefined,
  }),
);
const runtimeTickerCache: CoinbaseTickerCache = new Map();
runtimeTickerCache.set("BTC-USD", tickerUpdates[0]!);
runtimeTickerCache.set("ETH-USD", {
  productId: "ETH-USD",
  price: "3100.00",
  asOf: "2026-05-05T20:29:00.000Z",
  receivedAtMs: Date.parse("2026-05-05T20:29:00.000Z"),
});
const runtimeConfigurationMessage = {
  key: "configurationRequest" as const,
  contentType: "sayso.configure/configuration-request/1",
  content: { requestId: "runtime_config" },
  senderInboxId: "sender_runtime",
  conversationId: "conversation_runtime",
  tickerCache: runtimeTickerCache,
};
assert.deepEqual(
  await quickJsOracle.handleMessage(runtimeConfigurationMessage),
  await nativeOracle.handleMessage(runtimeConfigurationMessage),
);
const runtimeSpotMessage = {
  key: "spotPriceRequest" as const,
  contentType: "sayso.finance.oracle/spot-price-request/1",
  content: { requestId: "runtime_spot", markets: ["BTC/USD", "ETH/USD", "DOGE/USD", "bad market"] },
  senderInboxId: "sender_runtime",
  conversationId: "conversation_runtime",
  tickerCache: runtimeTickerCache,
};
assert.deepEqual(
  await quickJsOracle.handleMessage(runtimeSpotMessage),
  await nativeOracle.handleMessage(runtimeSpotMessage),
);
const runtimeMalformedSpotMessage = {
  key: "spotPriceRequest" as const,
  contentType: "sayso.finance.oracle/spot-price-request/1",
  content: { requestId: "runtime_malformed", markets: [] },
  senderInboxId: "sender_runtime",
  conversationId: "conversation_runtime",
  tickerCache: runtimeTickerCache,
};
assert.deepEqual(
  await quickJsOracle.handleMessage(runtimeMalformedSpotMessage),
  await nativeOracle.handleMessage(runtimeMalformedSpotMessage),
);
assert.deepEqual(
  await quickJsOracle.disconnect({
    agent: runtimeOracleAgent,
    senderInboxId: "sender_runtime",
    conversationId: "conversation_runtime",
  }),
  await nativeOracle.disconnect({
    agent: runtimeOracleAgent,
    senderInboxId: "sender_runtime",
    conversationId: "conversation_runtime",
  }),
);
assert.deepEqual(
  await quickJsOracle.forgetMe({
    agent: runtimeOracleAgent,
    senderInboxId: "sender_runtime",
    conversationId: "conversation_runtime",
  }),
  await nativeOracle.forgetMe({
    agent: runtimeOracleAgent,
    senderInboxId: "sender_runtime",
    conversationId: "conversation_runtime",
  }),
);
quickJsOracle.dispose();

const registrationSubmitCodec = saysoCodecs.find((codec) =>
  contentTypesAreEqual(codec.contentType, CONTENT_TYPES.registrationSubmit),
);
assert.ok(registrationSubmitCodec);
assert.deepEqual(registrationSubmitCodec.decode(registrationSubmitCodec.encode(networkRegistration)), networkRegistration);

console.log("unit tests passed");
