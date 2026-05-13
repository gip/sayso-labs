import { Client, createEOASigner, IdentifierKind, type DecodedMessage, type Dm } from "@xmtp/browser-sdk";
import {
  CONTENT_TYPES,
  contentTypeKey,
  contentTypeName,
  saysoCodecs,
  type AgentInfoPayload,
  type ConnectionResponsePayload,
  type JsonPayload,
  type SkillPacket,
  type XmtpEnv,
} from "@sayso-labs/protocol/browser";
export type ExplorerCallerKey = {
  ethAddress: string;
  ethPrivateKey: `0x${string}`;
};

const defaultInitialWaitMs = 4_000;
const defaultResponseWaitMs = 20_000;
const defaultOperationWaitMs = 30_000;

type SaySoMessage = DecodedMessage<JsonPayload | string>;

export type ExplorerPackage =
  | {
      kind: "agent-info";
      contentType: string;
      agent: AgentInfoPayload["agent"];
      protocolVersion: string;
      supportedProtocolVersions: string[];
      fallbackText: string;
      skillPacket: SkillPacket;
    }
  | {
      kind: "connection-response";
      contentType: string;
      agent: Extract<ConnectionResponsePayload, { status: "ok" }>["agent"];
      protocolVersion: string;
      supportedProtocolVersions: string[];
      verifiedClaims?: Extract<ConnectionResponsePayload, { status: "ok" }>["verifiedClaims"];
      skillPacket: SkillPacket;
    };

export type ExplorerProbeResult =
  | {
      status: "sayso";
      env: XmtpEnv;
      clientAddress: string;
      clientInboxId: string;
      targetAddress: string;
      package: ExplorerPackage;
    }
  | {
      status: "unreachable" | "timeout" | "non-sayso" | "sayso-error" | "error";
      env: XmtpEnv;
      clientAddress?: string;
      clientInboxId?: string;
      targetAddress: string;
      message: string;
      contentType?: string;
    };

const looksLikeEthAddress = (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value);

const identifierForEthAddress = (address: string) => ({
  identifier: address.toLowerCase(),
  identifierKind: IdentifierKind.Ethereum,
});

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const withTimeout = async <T,>(label: string, work: Promise<T>, timeoutMs = defaultOperationWaitMs): Promise<T> => {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(`${label} timed out.`)), timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
};

const waitForSaySoMessage = async (
  conversation: Dm<JsonPayload | string>,
  ownInboxId: string,
  expected: Array<ReturnType<typeof contentTypeKey>>,
  timeoutMs: number,
) => {
  const stream = await conversation.stream({ disableSync: true });
  try {
    const timeout = wait(timeoutMs).then(() => null);
    const message = (async () => {
      for await (const candidate of stream) {
        if (candidate.senderInboxId === ownInboxId) continue;
        const key = contentTypeKey(candidate.contentType);
        if (expected.includes(key)) return candidate as SaySoMessage;
        if (key === null) return candidate as SaySoMessage;
      }
      return null;
    })();
    return await Promise.race([message, timeout]);
  } finally {
    await stream.end();
  }
};

const sendTyped = async (conversation: Dm<JsonPayload | string>, content: JsonPayload, contentType = CONTENT_TYPES.connectionRequest) => {
  const codec = saysoCodecs.find(
    (candidate) =>
      candidate.contentType.authorityId === contentType.authorityId &&
      candidate.contentType.typeId === contentType.typeId &&
      candidate.contentType.versionMajor === contentType.versionMajor,
  );
  if (!codec) throw new Error(`No SaySo codec registered for ${contentTypeName(contentType)}.`);
  await conversation.send(codec.encode(content) as never);
};

const packageFromMessage = (message: SaySoMessage): ExplorerPackage | null => {
  const key = contentTypeKey(message.contentType);
  if (key === "agentInfo") {
    const content = message.content as AgentInfoPayload;
    return {
      kind: "agent-info",
      contentType: contentTypeName(CONTENT_TYPES.agentInfo),
      agent: content.agent,
      protocolVersion: content.protocolVersion,
      supportedProtocolVersions: content.supportedProtocolVersions,
      fallbackText: content.fallbackText,
      skillPacket: content.skillPacket,
    };
  }
  if (key === "connectionResponse") {
    const content = message.content as ConnectionResponsePayload;
    if (content.status === "error") return null;
    return {
      kind: "connection-response",
      contentType: contentTypeName(CONTENT_TYPES.connectionResponse),
      agent: content.agent,
      protocolVersion: content.protocolVersion,
      supportedProtocolVersions: content.supportedProtocolVersions,
      verifiedClaims: content.verifiedClaims,
      skillPacket: content.skillPacket,
    };
  }
  return null;
};

export const exploreSaySoAgent = async (input: {
  caller: ExplorerCallerKey;
  env: XmtpEnv;
  targetAddress: string;
  initialWaitMs?: number;
  responseWaitMs?: number;
}): Promise<ExplorerProbeResult> => {
  const targetAddress = input.targetAddress.trim().toLowerCase();
  if (!looksLikeEthAddress(targetAddress)) {
    return {
      status: "error",
      env: input.env,
      targetAddress,
      message: "Enter a valid Ethereum address.",
    };
  }

  const targetIdentifier = identifierForEthAddress(targetAddress);
  const canMessage = await withTimeout("Checking XMTP reachability", Client.canMessage([targetIdentifier], input.env));
  if (!canMessage.get(targetAddress)) {
    return {
      status: "unreachable",
      env: input.env,
      targetAddress,
      message: "This Ethereum address is not reachable on the selected XMTP environment.",
    };
  }

  let client: Client<JsonPayload | string> | undefined;
  try {
    client = await withTimeout("Creating browser XMTP client", Client.create(createEOASigner(input.caller.ethPrivateKey), ({
      env: input.env as never,
      codecs: saysoCodecs as never,
      appVersion: "sayso-labs-web/0",
      disableDeviceSync: true,
    }) as never) as Promise<Client<JsonPayload | string>>);
    const clientInboxId = client.inboxId ?? "";
    const existingDm = await withTimeout("Fetching existing XMTP DM", client.conversations.fetchDmByIdentifier(targetIdentifier));
    const conversation = (existingDm ?? (await withTimeout("Creating XMTP DM", client.conversations.createDmWithIdentifier(targetIdentifier)))) as Dm<JsonPayload | string>;
    const initialMessage = await waitForSaySoMessage(
      conversation,
      clientInboxId,
      ["agentInfo", "connectionResponse"],
      input.initialWaitMs ?? defaultInitialWaitMs,
    );
    const initialPackage = initialMessage ? packageFromMessage(initialMessage) : null;
    if (initialPackage) {
      return {
        status: "sayso",
        env: input.env,
        clientAddress: input.caller.ethAddress,
        clientInboxId,
        targetAddress,
        package: initialPackage,
      };
    }

    const pendingResponse = waitForSaySoMessage(
      conversation,
      clientInboxId,
      ["connectionResponse"],
      input.responseWaitMs ?? defaultResponseWaitMs,
    );
    await withTimeout("Sending SaySo connection request", sendTyped(conversation, {}, CONTENT_TYPES.connectionRequest));
    const responseMessage = await pendingResponse;
    if (!responseMessage) {
      return {
        status: "timeout",
        env: input.env,
        clientAddress: input.caller.ethAddress,
        clientInboxId,
        targetAddress,
        message: "Timed out waiting for a SaySo response.",
      };
    }

    const responseKey = contentTypeKey(responseMessage.contentType);
    if (responseKey === "connectionResponse") {
      const content = responseMessage.content as ConnectionResponsePayload;
      if (content.status === "error") {
        return {
          status: "sayso-error",
          env: input.env,
          clientAddress: input.caller.ethAddress,
          clientInboxId,
          targetAddress,
          contentType: contentTypeName(CONTENT_TYPES.connectionResponse),
          message: `${content.error.code}: ${content.error.message}`,
        };
      }
    }
    const responsePackage = packageFromMessage(responseMessage);
    if (!responsePackage) {
      return {
        status: "non-sayso",
        env: input.env,
        clientAddress: input.caller.ethAddress,
        clientInboxId,
        targetAddress,
        contentType: responseMessage.contentType ? contentTypeName(responseMessage.contentType) : undefined,
        message: "The first response was not a supported SaySo agent package.",
      };
    }

    return {
      status: "sayso",
      env: input.env,
      clientAddress: input.caller.ethAddress,
      clientInboxId,
      targetAddress,
      package: responsePackage,
    };
  } catch (error) {
    return {
      status: "error",
      env: input.env,
      clientAddress: input.caller.ethAddress,
      clientInboxId: client?.inboxId,
      targetAddress,
      message: error instanceof Error ? error.message : "Explorer failed.",
    };
  } finally {
    client?.close();
  }
};
