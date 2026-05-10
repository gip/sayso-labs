export type PingRequestPayload = {
  requestId: string;
  message?: string;
  sentAt?: string;
};

export type PongResponsePayload = {
  requestId: string;
  message: "pong";
  receivedMessage?: string;
  receivedAt: string;
  respondedAt: string;
};
