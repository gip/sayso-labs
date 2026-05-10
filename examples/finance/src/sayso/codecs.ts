import type {
  ContentCodec,
  ContentTypeId,
  EncodedContent,
} from "@xmtp/content-type-primitives";
import { CONTENT_TYPES } from "./contentTypes.js";
import type { SaySoConfigurePayload, SaySoCorePayload, SaySoNetworkPayload, SaySoOraclePayload } from "./types.js";

export type JsonPayload = SaySoCorePayload | SaySoNetworkPayload | SaySoConfigurePayload | SaySoOraclePayload;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class JsonContentCodec<T extends JsonPayload> implements ContentCodec<T> {
  constructor(
    public readonly contentType: ContentTypeId,
    private readonly label: string,
  ) {}

  encode(content: T): EncodedContent {
    return {
      type: this.contentType,
      parameters: {},
      fallback: this.fallback(content),
      content: textEncoder.encode(JSON.stringify(content)),
    };
  }

  decode(content: EncodedContent): T {
    return JSON.parse(textDecoder.decode(content.content)) as T;
  }

  fallback(content: T): string {
    if (content && typeof content === "object" && "fallbackText" in content && typeof content.fallbackText === "string") {
      return content.fallbackText;
    }
    return `${this.label}: ${JSON.stringify(content)}`;
  }

  shouldPush(): boolean {
    return true;
  }
}

export const saysoCodecs: ContentCodec<JsonPayload>[] = [
  new JsonContentCodec(CONTENT_TYPES.agentInfo, "SaySo agent info"),
  new JsonContentCodec(CONTENT_TYPES.connectionRequest, "SaySo connection request"),
  new JsonContentCodec(CONTENT_TYPES.connectionResponse, "SaySo connection response"),
  new JsonContentCodec(CONTENT_TYPES.skillRequest, "SaySo skill request"),
  new JsonContentCodec(CONTENT_TYPES.skillResponse, "SaySo skill response"),
  new JsonContentCodec(CONTENT_TYPES.disconnect, "SaySo disconnect"),
  new JsonContentCodec(CONTENT_TYPES.forgetMe, "SaySo forget me"),
  new JsonContentCodec(CONTENT_TYPES.disconnectAck, "SaySo disconnect ack"),
  new JsonContentCodec(CONTENT_TYPES.error, "SaySo error"),
  new JsonContentCodec(CONTENT_TYPES.registrationSubmit, "SaySo network registration submit"),
  new JsonContentCodec(CONTENT_TYPES.registrationResult, "SaySo network registration result"),
  new JsonContentCodec(CONTENT_TYPES.configurationRequest, "SaySo configure configuration request"),
  new JsonContentCodec(CONTENT_TYPES.configurationResponse, "SaySo configure configuration response"),
  new JsonContentCodec(CONTENT_TYPES.spotPriceRequest, "SaySo oracle spot price request"),
  new JsonContentCodec(CONTENT_TYPES.spotPriceResponse, "SaySo oracle spot price response"),
];

export type SaySoCodecContent = JsonPayload | string;
