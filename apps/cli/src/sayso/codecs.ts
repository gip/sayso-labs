import type {
  ContentCodec,
  ContentTypeId,
  EncodedContent,
} from "@xmtp/content-type-primitives";
import { CONTENT_TYPES } from "./contentTypes.js";
import type {
  SaySoConfigurePayload,
  SaySoCorePayload,
  SaySoForkPayload,
  SaySoNetworkPayload,
  SaySoSourcePayload,
  SaySoPaymentPayload,
} from "./types.js";
import type { PingRequestPayload, PongResponsePayload } from "../pong/types.js";

export type JsonPayload =
  | SaySoCorePayload
  | SaySoNetworkPayload
  | SaySoPaymentPayload
  | SaySoConfigurePayload
  | SaySoSourcePayload
  | SaySoForkPayload
  | PingRequestPayload
  | PongResponsePayload;

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
  new JsonContentCodec(CONTENT_TYPES.premiumRegistrationSubmit, "SaySo network premium registration submit"),
  new JsonContentCodec(CONTENT_TYPES.registrationResult, "SaySo network registration result"),
  new JsonContentCodec(CONTENT_TYPES.paymentRequired, "SaySo payment required"),
  new JsonContentCodec(CONTENT_TYPES.paymentSubmit, "SaySo payment submit"),
  new JsonContentCodec(CONTENT_TYPES.paymentResult, "SaySo payment result"),
  new JsonContentCodec(CONTENT_TYPES.configurationRequest, "SaySo configure configuration request"),
  new JsonContentCodec(CONTENT_TYPES.configurationResponse, "SaySo configure configuration response"),
  new JsonContentCodec(CONTENT_TYPES.sourceManifestRequest, "SaySo source manifest request"),
  new JsonContentCodec(CONTENT_TYPES.sourceManifestResponse, "SaySo source manifest response"),
  new JsonContentCodec(CONTENT_TYPES.sourceChunkRequest, "SaySo source chunk request"),
  new JsonContentCodec(CONTENT_TYPES.sourceChunkResponse, "SaySo source chunk response"),
  new JsonContentCodec(CONTENT_TYPES.forkOffersRequest, "SaySo fork offers request"),
  new JsonContentCodec(CONTENT_TYPES.forkOffersResponse, "SaySo fork offers response"),
  new JsonContentCodec(CONTENT_TYPES.forkRequest, "SaySo fork request"),
  new JsonContentCodec(CONTENT_TYPES.forkResult, "SaySo fork result"),
  new JsonContentCodec(CONTENT_TYPES.pingRequest, "SaySo pong ping request"),
  new JsonContentCodec(CONTENT_TYPES.pongResponse, "SaySo pong response"),
];

export type SaySoCodecContent = JsonPayload | string;
