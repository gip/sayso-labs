import quickJsVariant from "@jitl/quickjs-wasmfile-release-sync";
import {
  newQuickJSWASMModuleFromVariant,
  type QuickJSContext,
  type QuickJSHandle,
  type QuickJSSyncVariant,
} from "quickjs-emscripten-core";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export const SAYSO_RUNTIME_SKILL_ID = "sayso.runtime";
export const SAYSO_RUNTIME_ABI_VERSION = "0.1.0";

export type SaySoRuntimeSigner = {
  getAccount(): Promise<JsonObject> | JsonObject;
  signMessage(input: JsonObject): Promise<JsonObject> | JsonObject;
};

export type SaySoRuntimeNetworkPolicyInput = {
  op: "network.https.request" | "network.wss.open";
  url: string;
  origin: string;
  declaredOrigins: string[];
  input: JsonObject;
};

export type SaySoRuntimeNetwork = {
  httpsRequest?(input: JsonObject): Promise<JsonValue> | JsonValue;
  wssOpen?(input: JsonObject): Promise<JsonValue> | JsonValue;
};

export type SaySoRuntimeLocalTextWriteInput = {
  message: string;
  channel?: string;
  format?: "plain" | "markdown";
};

export type SaySoRuntimeLocalTextWriteOutput = {
  status: "ok";
};

export type SaySoRuntimeLocalTextReadInput = {
  prompt?: string;
  defaultValue?: string;
  multiline?: boolean;
  secret?: boolean;
  timeoutMs?: number;
};

export type SaySoRuntimeLocalTextReadOutput =
  | {
      status: "ok";
      value: string;
    }
  | {
      status: "cancelled" | "timeout" | "unavailable";
      message?: string;
    };

export type SaySoRuntimeLocalText = {
  write?(
    input: SaySoRuntimeLocalTextWriteInput,
  ): Promise<void | SaySoRuntimeLocalTextWriteOutput> | void | SaySoRuntimeLocalTextWriteOutput;
  read?(input: SaySoRuntimeLocalTextReadInput): Promise<SaySoRuntimeLocalTextReadOutput> | SaySoRuntimeLocalTextReadOutput;
};

export type SaySoRuntimeHostOptions = {
  params?: JsonObject;
  clock?: { now(): Date };
  idGenerator?: () => string;
  signer?: SaySoRuntimeSigner;
  localText?: SaySoRuntimeLocalText;
  network?: SaySoRuntimeNetwork;
  networkPolicy?: (input: SaySoRuntimeNetworkPolicyInput) => Promise<boolean> | boolean;
  operations?: Record<string, (input: JsonObject) => Promise<JsonValue> | JsonValue>;
};

export type SaySoRuntimeApplication = {
  appId: string;
  runtime?: {
    skillId?: string;
    abiVersion?: string;
  };
  hostOperations?: string[];
  capabilities?: {
    network?: {
      https?: string[];
      wss?: string[];
    };
  };
};

const JSON_BOUNDARY_ERROR = "SaySo host boundary only accepts JSON-serializable values.";

const defaultClock = { now: () => new Date() };
const defaultIdGenerator = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null) return true;
  if (typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.entries(value as Record<string, unknown>).every(
    ([key, item]) => typeof key === "string" && isJsonValue(item),
  );
};

const assertJsonValue = (value: unknown): JsonValue => {
  if (!isJsonValue(value)) throw new Error(JSON_BOUNDARY_ERROR);
  return value;
};

const assertJsonObject = (value: unknown): JsonObject => {
  if (!isJsonValue(value) || value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error("Expected a JSON object.");
  }
  return value;
};

const bootstrapCode = `
(() => {
  const forbiddenGlobals = [
    "fetch",
    "WebSocket",
    "XMLHttpRequest",
    "EventSource",
    "importScripts",
    "process",
    "require",
    "Buffer",
  ];
  for (const name of forbiddenGlobals) {
    try {
      Object.defineProperty(globalThis, name, {
        value: undefined,
        writable: false,
        enumerable: false,
        configurable: false,
      });
    } catch (_error) {}
  }

  const isJsonSerializable = (value, seen) => {
    if (value === null) return true;
    const type = typeof value;
    if (type === "string" || type === "boolean") return true;
    if (type === "number") return Number.isFinite(value);
    if (type !== "object") return false;
    if (seen.has(value)) return false;
    if (!Array.isArray(value)) {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) return false;
    }
    seen.add(value);
    const values = Array.isArray(value) ? value : Object.values(value);
    for (const item of values) {
      if (!isJsonSerializable(item, seen)) return false;
    }
    seen.delete(value);
    return true;
  };

  globalThis.__saysoSerializeJson = (value) => {
    if (!isJsonSerializable(value, new WeakSet())) {
      throw new TypeError(${JSON.stringify(JSON_BOUNDARY_ERROR)});
    }
    return JSON.stringify(value);
  };

  globalThis.__saysoApplicationMetadata = (application) => {
    if (!application || typeof application !== "object") {
      throw new TypeError("sayso.registerApplication requires an application object.");
    }
    const metadata = {
      appId: application.appId,
      runtime: application.runtime ?? {},
      hostOperations: application.hostOperations ?? [],
      capabilities: application.capabilities ?? {},
    };
    if (!isJsonSerializable(metadata, new WeakSet())) {
      throw new TypeError(${JSON.stringify(JSON_BOUNDARY_ERROR)});
    }
    return JSON.stringify(metadata);
  };
})();
`;

const quickJsError = (vm: QuickJSContext, handle: QuickJSHandle) => {
  const dumped = vm.dump(handle);
  if (dumped instanceof Error) return dumped;
  if (dumped && typeof dumped === "object" && "message" in dumped) {
    const message = String((dumped as { message: unknown }).message);
    const error = new Error(message);
    if ("name" in dumped && typeof dumped.name === "string") error.name = dumped.name;
    return error;
  }
  return new Error(String(dumped));
};

const isRecord = (value: JsonValue): value is JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const stringArray = (value: JsonValue | undefined): string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];

const assertLocalTextWriteInput = (input: JsonObject): SaySoRuntimeLocalTextWriteInput => {
  if (typeof input.message !== "string") throw new Error("local.text.write requires a string message.");
  if (input.channel !== undefined && typeof input.channel !== "string") {
    throw new Error("local.text.write channel must be a string.");
  }
  if (input.format !== undefined && input.format !== "plain" && input.format !== "markdown") {
    throw new Error('local.text.write format must be "plain" or "markdown".');
  }
  return {
    message: input.message,
    ...(typeof input.channel === "string" ? { channel: input.channel } : {}),
    ...(input.format === "plain" || input.format === "markdown" ? { format: input.format } : {}),
  };
};

const assertLocalTextReadInput = (input: JsonObject): SaySoRuntimeLocalTextReadInput => {
  if (input.prompt !== undefined && typeof input.prompt !== "string") {
    throw new Error("local.text.read prompt must be a string.");
  }
  if (input.defaultValue !== undefined && typeof input.defaultValue !== "string") {
    throw new Error("local.text.read defaultValue must be a string.");
  }
  if (input.multiline !== undefined && typeof input.multiline !== "boolean") {
    throw new Error("local.text.read multiline must be a boolean.");
  }
  if (input.secret !== undefined && typeof input.secret !== "boolean") {
    throw new Error("local.text.read secret must be a boolean.");
  }
  if (
    input.timeoutMs !== undefined &&
    (typeof input.timeoutMs !== "number" || !Number.isInteger(input.timeoutMs) || input.timeoutMs < 0)
  ) {
    throw new Error("local.text.read timeoutMs must be a non-negative integer.");
  }
  return {
    ...(typeof input.prompt === "string" ? { prompt: input.prompt } : {}),
    ...(typeof input.defaultValue === "string" ? { defaultValue: input.defaultValue } : {}),
    ...(typeof input.multiline === "boolean" ? { multiline: input.multiline } : {}),
    ...(typeof input.secret === "boolean" ? { secret: input.secret } : {}),
    ...(typeof input.timeoutMs === "number" ? { timeoutMs: input.timeoutMs } : {}),
  };
};

const assertLocalTextWriteOutput = (value: void | SaySoRuntimeLocalTextWriteOutput): JsonObject => {
  if (value === undefined) return { status: "ok" };
  const output = assertJsonObject(value);
  if (output.status !== "ok") throw new Error('local.text.write must return status "ok".');
  return output;
};

const assertLocalTextReadOutput = (value: SaySoRuntimeLocalTextReadOutput): JsonObject => {
  const output = assertJsonObject(value);
  if (output.status === "ok") {
    if (typeof output.value !== "string") throw new Error("local.text.read ok output requires a string value.");
    return output;
  }
  if (output.status === "cancelled" || output.status === "timeout" || output.status === "unavailable") {
    if (output.message !== undefined && typeof output.message !== "string") {
      throw new Error("local.text.read non-ok output message must be a string.");
    }
    return output;
  }
  throw new Error("local.text.read returned an unsupported status.");
};

export const createQuickJsApplication = async (
  program: string,
  options: SaySoRuntimeHostOptions = {},
) => {
  const variant =
    (quickJsVariant as unknown as { default?: QuickJSSyncVariant }).default ??
    (quickJsVariant as unknown as QuickJSSyncVariant);
  const QuickJS = await newQuickJSWASMModuleFromVariant(variant);
  const vm = QuickJS.newContext();
  const clock = options.clock ?? defaultClock;
  const idGenerator = options.idGenerator ?? defaultIdGenerator;
  let applicationHandle: QuickJSHandle | null = null;
  let application: SaySoRuntimeApplication | null = null;

  const executePendingJobs = () => {
    const result = vm.runtime.executePendingJobs();
    try {
      if (result.error) throw quickJsError(vm, result.error);
    } finally {
      result.dispose();
    }
  };

  const toVmJson = (value: JsonValue) => {
    assertJsonValue(value);
    const result = vm.evalCode(`(${JSON.stringify(value)})`, "sayso-host-json.js");
    return vm.unwrapResult(result);
  };

  const serializerHandle = (() => {
    const result = vm.evalCode(bootstrapCode, "sayso-host-bootstrap.js");
    vm.unwrapResult(result).dispose();
    return vm.getProp(vm.global, "__saysoSerializeJson");
  })();
  const applicationMetadataHandle = vm.getProp(vm.global, "__saysoApplicationMetadata");

  const fromVmJson = (handle: QuickJSHandle): JsonValue => {
    const result = vm.callFunction(serializerHandle, vm.undefined, handle);
    const jsonHandle = vm.unwrapResult(result);
    try {
      return assertJsonValue(JSON.parse(vm.getString(jsonHandle)));
    } finally {
      jsonHandle.dispose();
    }
  };

  const hostErrorHandle = (error: unknown) =>
    vm.newError(error instanceof Error ? error.message : String(error));

  const capabilities = () => application?.capabilities ?? {};

  const declaredOriginsFor = (kind: "https" | "wss") =>
    stringArray(capabilities().network?.[kind] as JsonValue | undefined);

  const assertNetworkAllowed = async (
    op: "network.https.request" | "network.wss.open",
    input: JsonObject,
  ) => {
    if (typeof input.url !== "string") throw new Error(`${op} requires a string url.`);
    const url = new URL(input.url);
    const kind = op === "network.https.request" ? "https" : "wss";
    if (url.protocol !== `${kind}:`) throw new Error(`${op} only supports ${kind}: URLs.`);
    const declaredOrigins = declaredOriginsFor(kind);
    if (!declaredOrigins.includes(url.origin)) {
      throw new Error(`${op} denied: ${url.origin} was not declared by the application.`);
    }
    const allowed = await options.networkPolicy?.({
      op,
      url: input.url,
      origin: url.origin,
      declaredOrigins,
      input,
    });
    if (!allowed) throw new Error(`${op} denied by runtime policy for ${url.origin}.`);
  };

  const handleHostCall = async (op: string, input: JsonObject): Promise<JsonValue> => {
    if (op === "params.get") return options.params ?? {};
    if (op === "clock.nowIso") return clock.now().toISOString();
    if (op === "id.generate") return idGenerator();
    if (op === "signer.getAccount") {
      if (!options.signer) throw new Error("signer.getAccount is not configured.");
      return assertJsonObject(await options.signer.getAccount());
    }
    if (op === "signer.signMessage") {
      if (!options.signer) throw new Error("signer.signMessage is not configured.");
      if (typeof input.message !== "string") throw new Error("signer.signMessage requires a string message.");
      return assertJsonObject(await options.signer.signMessage(input));
    }
    if (op === "local.text.write") {
      const request = assertLocalTextWriteInput(input);
      if (!options.localText?.write) throw new Error("local.text.write is not configured.");
      return assertLocalTextWriteOutput(await options.localText.write(request));
    }
    if (op === "local.text.read") {
      const request = assertLocalTextReadInput(input);
      if (!options.localText?.read) throw new Error("local.text.read is not configured.");
      return assertLocalTextReadOutput(await options.localText.read(request));
    }
    if (op === "network.https.request") {
      await assertNetworkAllowed(op, input);
      if (!options.network?.httpsRequest) throw new Error("network.https.request is not configured.");
      return assertJsonValue(await options.network.httpsRequest(input));
    }
    if (op === "network.wss.open") {
      await assertNetworkAllowed(op, input);
      if (!options.network?.wssOpen) throw new Error("network.wss.open is not configured.");
      return assertJsonValue(await options.network.wssOpen(input));
    }
    const customOperation = options.operations?.[op];
    if (customOperation) return assertJsonValue(await customOperation(input));
    throw new Error(`Unsupported SaySo host operation: ${op}`);
  };

  const sayso = vm.newObject();
  const registerApplication = vm.newFunction("registerApplication", (appHandle) => {
    const metadataResult = vm.callFunction(applicationMetadataHandle, vm.undefined, appHandle);
    const metadataJsonHandle = vm.unwrapResult(metadataResult);
    const metadata = assertJsonValue(JSON.parse(vm.getString(metadataJsonHandle)));
    metadataJsonHandle.dispose();
    if (!isRecord(metadata) || typeof metadata.appId !== "string") {
      throw new Error("sayso.registerApplication requires an object with appId.");
    }
    const hostOperations =
      Array.isArray(metadata.hostOperations) && metadata.hostOperations.every((item) => typeof item === "string")
        ? (metadata.hostOperations as string[])
        : undefined;
    applicationHandle?.dispose();
    applicationHandle = appHandle.dup();
    application = {
      appId: metadata.appId,
      ...(isRecord(metadata.runtime) ? { runtime: metadata.runtime as SaySoRuntimeApplication["runtime"] } : {}),
      ...(hostOperations ? { hostOperations } : {}),
      ...(isRecord(metadata.capabilities) ? { capabilities: metadata.capabilities as SaySoRuntimeApplication["capabilities"] } : {}),
    };
  });
  const call = vm.newFunction("call", (opHandle, inputHandle) => {
    const op = vm.getString(opHandle);
    const input = assertJsonObject(fromVmJson(inputHandle));
    const deferred = vm.newPromise();
    void Promise.resolve()
      .then(() => handleHostCall(op, input))
      .then(
        (value) => {
          const valueHandle = toVmJson(value);
          deferred.resolve(valueHandle);
          valueHandle.dispose();
          executePendingJobs();
        },
        (error) => {
          const errorHandle = hostErrorHandle(error);
          deferred.reject(errorHandle);
          errorHandle.dispose();
          executePendingJobs();
        },
      );
    return deferred.handle;
  });
  vm.setProp(sayso, "registerApplication", registerApplication);
  vm.setProp(sayso, "call", call);
  vm.setProp(vm.global, "sayso", sayso);
  registerApplication.dispose();
  call.dispose();
  sayso.dispose();

  const freezeResult = vm.evalCode("Object.freeze(globalThis.sayso);", "sayso-host-freeze.js");
  vm.unwrapResult(freezeResult).dispose();

  const loadResult = vm.evalCode(program, "sayso-quickjs-application.js");
  vm.unwrapResult(loadResult).dispose();
  if (!applicationHandle || !application) throw new Error("QuickJS application did not call sayso.registerApplication.");

  const resolveMaybePromise = async (handle: QuickJSHandle) => {
    const pending = vm.resolvePromise(handle);
    executePendingJobs();
    const result = await pending;
    executePendingJobs();
    return vm.unwrapResult(result);
  };

  const callApplicationMethod = async (method: string, input: JsonValue): Promise<JsonValue> => {
    if (!applicationHandle) throw new Error("QuickJS application has not been registered.");
    const methodHandle = vm.getProp(applicationHandle, method);
    try {
      if (vm.typeof(methodHandle) !== "function") throw new Error(`QuickJS application is missing ${method}.`);
      const inputHandle = toVmJson(input);
      let resultHandle: QuickJSHandle | null = null;
      let valueHandle: QuickJSHandle | null = null;
      try {
        resultHandle = vm.unwrapResult(vm.callFunction(methodHandle, applicationHandle, inputHandle));
        valueHandle = await resolveMaybePromise(resultHandle);
        return fromVmJson(valueHandle);
      } finally {
        inputHandle.dispose();
        valueHandle?.dispose();
        if (resultHandle && resultHandle.alive) resultHandle.dispose();
      }
    } finally {
      methodHandle.dispose();
    }
  };

  return {
    get application() {
      if (!application) throw new Error("QuickJS application has not been registered.");
      return application;
    },
    call: callApplicationMethod,
    dispose: () => {
      applicationHandle?.dispose();
      serializerHandle.dispose();
      applicationMetadataHandle.dispose();
      vm.dispose();
    },
  };
};
