import { mkdirSync } from "node:fs";
import path from "node:path";
import { Client, IdentifierKind, type Conversation, type Dm, type Signer } from "@xmtp/node-sdk";
import { contentTypesAreEqual, type ContentCodec, type ContentTypeId, type EncodedContent } from "@xmtp/content-type-primitives";
import { hexToBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { saysoCodecs, type SaySoCodecContent, type XmtpEnv } from "@sayso-labs/protocol";

export type SaySoClient = Client<SaySoCodecContent>;
export type SaySoSendConversation = Pick<Conversation<SaySoCodecContent>, "send" | "sendText">;

const normalizePrivateKey = (value: string): `0x${string}` => {
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("XMTP_PRIVATE_KEY must be 32 bytes as 64 hex characters.");
  }
  return normalized as `0x${string}`;
};

const normalizeDbEncryptionKey = (value: string): `0x${string}` => {
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("XMTP_DB_ENCRYPTION_KEY must be 32 bytes as 64 hex characters.");
  }
  return normalized as `0x${string}`;
};

const createSigner = (privateKey: `0x${string}`): Signer => {
  const account = privateKeyToAccount(privateKey);
  return {
    type: "EOA",
    getIdentifier: () => ({
      identifier: account.address.toLowerCase(),
      identifierKind: IdentifierKind.Ethereum,
    }),
    signMessage: async (message: string) => hexToBytes(await account.signMessage({ message })),
  };
};

export const createXmtpClient = async (input: {
  privateKey: string;
  dbEncryptionKey: string;
  env: XmtpEnv;
  dbDir?: string;
}): Promise<{ client: SaySoClient; walletAddress: string }> => {
  const privateKey = normalizePrivateKey(input.privateKey);
  const dbEncryptionKey = normalizeDbEncryptionKey(input.dbEncryptionKey);
  const account = privateKeyToAccount(privateKey);
  const dbRoot = input.dbDir ?? ".data/xmtp/network-agent";
  const dbDir = path.resolve(dbRoot, account.address.toLowerCase(), input.env);
  mkdirSync(dbDir, { recursive: true });
  const clientOptions = {
    env: input.env,
    dbPath: path.join(dbDir, "xmtp.db3"),
    dbEncryptionKey,
    codecs: saysoCodecs as unknown as ContentCodec[],
  } as unknown as Parameters<typeof Client.create>[1];
  const client = (await Client.create(createSigner(privateKey), clientOptions)) as SaySoClient;
  return { client, walletAddress: account.address.toLowerCase() };
};

export const sendTyped = async (
  conversation: SaySoSendConversation,
  content: SaySoCodecContent,
  contentType?: ContentTypeId,
) => {
  if (typeof content === "string") return conversation.sendText(content);
  if (!contentType) throw new Error("Missing content type for SaySo JSON payload.");
  const codec = saysoCodecs.find(
    (candidate) =>
      contentTypesAreEqual(candidate.contentType, contentType) &&
      candidate.contentType.versionMajor === contentType.versionMajor,
  );
  if (!codec) {
    throw new Error(`No codec registered for ${contentType.authorityId}/${contentType.typeId}/${contentType.versionMajor}.`);
  }
  const encoded = codec.encode(content as never) as EncodedContent;
  return conversation.send(encoded);
};

export type SaySoDm = Dm<SaySoCodecContent>;
