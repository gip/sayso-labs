import { mkdirSync } from "node:fs";
import path from "node:path";
import { Client, IdentifierKind, type Conversation, type Dm, type Identifier, type Signer } from "@xmtp/node-sdk";
import {
  contentTypesAreEqual,
  type ContentCodec,
  type ContentTypeId,
  type EncodedContent,
} from "@xmtp/content-type-primitives";
import { hexToBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { saysoCodecs, type SaySoCodecContent } from "./codecs.js";
import type { XmtpEnv } from "./types.js";

export type SaySoClient = Client<SaySoCodecContent>;
export type SaySoConversation = Dm<SaySoCodecContent>;
export type SaySoSendConversation = Pick<Conversation<SaySoCodecContent>, "send" | "sendText">;

export type SharedCliOptions = {
  privateKey?: string;
  env?: XmtpEnv;
  dbDir?: string;
};

export const normalizePrivateKey = (value?: string): `0x${string}` => {
  const privateKey = value ?? process.env.XMTP_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Missing private key. Pass --private-key or set XMTP_PRIVATE_KEY.");
  }
  const normalized = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("Private key must be 32 bytes as 64 hex characters, with or without 0x.");
  }
  return normalized as `0x${string}`;
};

export const normalizeDbEncryptionKey = (): `0x${string}` => {
  const value = process.env.XMTP_DB_ENCRYPTION_KEY;
  if (!value) {
    throw new Error("Missing XMTP_DB_ENCRYPTION_KEY. It must be 32 bytes as 64 hex characters.");
  }
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("XMTP_DB_ENCRYPTION_KEY must be 32 bytes as 64 hex characters.");
  }
  return normalized as `0x${string}`;
};

export const createSigner = (privateKey: `0x${string}`): Signer => {
  const account = privateKeyToAccount(privateKey);
  return {
    type: "EOA",
    getIdentifier: () => ({
      identifier: account.address.toLowerCase(),
      identifierKind: IdentifierKind.Ethereum,
    }),
    signMessage: async (message: string) => {
      const signature = await account.signMessage({ message });
      return hexToBytes(signature);
    },
  };
};

export const walletAddressFromPrivateKey = (privateKey: `0x${string}`) =>
  privateKeyToAccount(privateKey).address.toLowerCase();

export const dbPathFor = (input: {
  dbDir: string;
  command: string;
  walletAddress: string;
  env: XmtpEnv;
}) => {
  const dir = path.resolve(input.dbDir, input.command, input.walletAddress, input.env);
  mkdirSync(dir, { recursive: true });
  return path.join(dir, "xmtp.db3");
};

export const createXmtpClient = async (
  command: string,
  options: SharedCliOptions,
): Promise<{ client: SaySoClient; walletAddress: string; signer: Signer }> => {
  const privateKey = normalizePrivateKey(options.privateKey);
  const env = options.env ?? "dev";
  const dbDir = options.dbDir ?? ".data/xmtp";
  const walletAddress = walletAddressFromPrivateKey(privateKey);
  const signer = createSigner(privateKey);
  const dbPath = dbPathFor({ dbDir, command, walletAddress, env });
  const clientOptions = {
    env,
    dbPath,
    dbEncryptionKey: normalizeDbEncryptionKey(),
    codecs: saysoCodecs as unknown as ContentCodec[],
  } as unknown as Parameters<typeof Client.create>[1];
  const client = (await Client.create(signer, clientOptions)) as SaySoClient;
  return { client, walletAddress, signer };
};

export const identifierForWallet = (wallet: string): Identifier => ({
  identifier: wallet.toLowerCase(),
  identifierKind: IdentifierKind.Ethereum,
});

export const looksLikeWalletAddress = (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value);

export const getOrCreateDm = async (client: SaySoClient, target: string): Promise<SaySoConversation> => {
  if (looksLikeWalletAddress(target)) {
    const identifier = identifierForWallet(target);
    const existing = await client.conversations.fetchDmByIdentifier(identifier);
    return (existing ?? (await client.conversations.createDmWithIdentifier(identifier))) as SaySoConversation;
  }
  const existing = client.conversations.getDmByInboxId(target);
  return (existing ?? (await client.conversations.createDm(target))) as SaySoConversation;
};

export const sendTyped = async (
  conversation: SaySoSendConversation,
  content: SaySoCodecContent,
  contentType?: ContentTypeId,
) => {
  if (typeof content === "string") {
    return conversation.sendText(content);
  }
  if (!contentType) {
    throw new Error("Missing content type for SaySo JSON payload.");
  }
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
