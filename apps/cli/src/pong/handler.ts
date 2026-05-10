import type { PingRequestPayload, PongResponsePayload } from "./types.js";
import { isRecord } from "../sayso/validation.js";

export const isPingRequest = (value: unknown): value is PingRequestPayload =>
  isRecord(value) &&
  typeof value.requestId === "string" &&
  value.requestId.length > 0 &&
  (value.message === undefined || typeof value.message === "string") &&
  (value.sentAt === undefined || typeof value.sentAt === "string");

export const createPongResponse = (
  request: PingRequestPayload,
  receivedAt = new Date().toISOString(),
  respondedAt = new Date().toISOString(),
): PongResponsePayload => ({
  requestId: request.requestId,
  message: "pong",
  ...(request.message ? { receivedMessage: request.message } : {}),
  receivedAt,
  respondedAt,
});
