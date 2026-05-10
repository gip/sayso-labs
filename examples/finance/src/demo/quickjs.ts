import { readFileSync } from "node:fs";
import { createQuickJsApplication, type JsonObject, type JsonValue, type SaySoRuntimeHostOptions } from "../sayso/quickjs.js";
import type { ConnectionResponsePayload, SpotPriceResponsePayload, XmtpEnv } from "../sayso/types.js";

export const DEMO_RUNTIME_APP_FILENAME = "runtime-app.js";

export const readDemoRuntimeAppSource = () =>
  readFileSync(new URL(DEMO_RUNTIME_APP_FILENAME, import.meta.url), "utf8");

export type DemoRuntimeParams = {
  walletAddress: string;
  inboxId: string;
  env: XmtpEnv;
  oracle: string;
};

export type DemoRunResult = {
  status: "ok" | "cancelled" | "timeout" | "unavailable";
};

export type DemoRuntimeHost = {
  connect(): Promise<ConnectionResponsePayload> | ConnectionResponsePayload;
  supportedMarkets(): Promise<string[]> | string[];
  spotPrices(input: { markets: string[] }): Promise<SpotPriceResponsePayload> | SpotPriceResponsePayload;
};

const asStringArray = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${label} must be a string array.`);
  }
  return value;
};

export const createQuickJsDemoApplication = async (input: {
  params: DemoRuntimeParams;
  localText: NonNullable<SaySoRuntimeHostOptions["localText"]>;
  host: DemoRuntimeHost;
  runtimeHost?: Omit<SaySoRuntimeHostOptions, "params" | "localText" | "operations">;
}) => {
  const quickJs = await createQuickJsApplication(readDemoRuntimeAppSource(), {
    ...input.runtimeHost,
    localText: input.localText,
    params: input.params as unknown as JsonObject,
    operations: {
      "demo.connect": async () => (await input.host.connect()) as unknown as JsonValue,
      "demo.supportedMarkets": async () => (await input.host.supportedMarkets()) as unknown as JsonValue,
      "demo.spotPrices": async (request) => {
        const markets = asStringArray(request.markets, "demo.spotPrices markets");
        return (await input.host.spotPrices({ markets })) as unknown as JsonValue;
      },
    },
  });

  return {
    get application() {
      return quickJs.application;
    },
    run: async () => quickJs.call("run", {}) as Promise<DemoRunResult>,
    dispose: quickJs.dispose,
  };
};
