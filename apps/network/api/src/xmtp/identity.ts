import { IdentifierKind, type Identifier, type InboxState } from "@xmtp/node-sdk";
import type { SaySoClient } from "./client.js";

export type VerifiedSenderIdentity = {
  senderInboxId: string;
  walletAddress?: string;
};

const walletAddressFromIdentifier = (identifier?: Pick<Identifier, "identifier" | "identifierKind">) => {
  if (identifier?.identifierKind !== IdentifierKind.Ethereum) return undefined;
  return identifier.identifier.toLowerCase();
};

export const walletAddressFromInboxState = (
  state?: Pick<InboxState, "identifiers" | "recoveryIdentifier"> | null,
) => {
  const walletAddress = state?.identifiers.map(walletAddressFromIdentifier).find(Boolean);
  return walletAddress ?? walletAddressFromIdentifier(state?.recoveryIdentifier);
};

export const resolveSenderIdentity = async (
  client: Pick<SaySoClient, "preferences">,
  senderInboxId: string,
): Promise<VerifiedSenderIdentity> => {
  const inboxStates = await client.preferences.fetchInboxStates([senderInboxId]);
  const inboxState = inboxStates.find((state) => state.inboxId === senderInboxId) ?? inboxStates[0];
  return {
    senderInboxId,
    walletAddress: walletAddressFromInboxState(inboxState),
  };
};
