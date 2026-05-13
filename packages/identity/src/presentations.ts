import { agentAddressList, deriveAgentAddresses, deriveIdentityHandle } from "./derive.js";
import { signMessageWithAgentKeys } from "./sign.js";
import type {
  AgentAddresses,
  AgentRosterPresentation,
  ChainType,
  WalletControlPresentation,
} from "./types.js";

const WALLET_CONTROL_CLAIM = "I control these wallets" as const;

export type RosterAgentInput = {
  index: number;
  label?: string;
  addresses: AgentAddresses;
};

export const buildAgentRoster = (
  identityHandle: string,
  agents: RosterAgentInput[],
  timestamp: string = new Date().toISOString(),
): AgentRosterPresentation => ({
  type: "sayso.identity.agent-roster",
  payload: {
    identityHandle,
    agents: agents.map((agent) => ({
      index: agent.index,
      ...(agent.label ? { label: agent.label } : {}),
      addresses: agentAddressList(agent.addresses).map(({ type, address, derivationPath }) => ({
        type,
        address,
        derivationPath,
      })),
    })),
    timestamp,
  },
});

export const buildWalletControlClaim = async (
  mnemonic: string,
  indices: number[],
  options: {
    passphrase?: string;
    timestamp?: string;
    chains?: ChainType[];
  } = {},
): Promise<WalletControlPresentation> => {
  const timestamp = options.timestamp ?? new Date().toISOString();
  const passphrase = options.passphrase ?? "";
  const chains = options.chains ?? (["ethereum", "bitcoin", "ripple", "stellar"] as ChainType[]);

  const wallets: Array<{ type: ChainType; address: string }> = [];
  const signatures: WalletControlPresentation["payload"]["signatures"] = [];

  for (const index of indices) {
    const addresses = deriveAgentAddresses(mnemonic, index, passphrase);
    const addressByChain: Record<ChainType, string> = {
      ethereum: addresses.ethereum.address,
      bitcoin: addresses.bitcoin.address,
      ripple: addresses.ripple.address,
      stellar: addresses.stellar.address,
    };
    for (const chain of chains) wallets.push({ type: chain, address: addressByChain[chain] });
  }

  const message = JSON.stringify({ claim: WALLET_CONTROL_CLAIM, wallets, timestamp });
  for (const index of indices) {
    const addresses = deriveAgentAddresses(mnemonic, index, passphrase);
    const addressByChain: Record<ChainType, string> = {
      ethereum: addresses.ethereum.address,
      bitcoin: addresses.bitcoin.address,
      ripple: addresses.ripple.address,
      stellar: addresses.stellar.address,
    };
    const sigs = await signMessageWithAgentKeys(mnemonic, index, message, passphrase);
    for (const sig of sigs) {
      if (!chains.includes(sig.type)) continue;
      signatures.push({
        type: sig.type,
        address: addressByChain[sig.type],
        signatureScheme: sig.signatureScheme,
        signature: sig.signature,
      });
    }
  }

  return {
    type: "sayso.claim.wallet-control",
    payload: {
      message: { claim: WALLET_CONTROL_CLAIM, wallets, timestamp },
      signatures,
    },
  };
};

export const rosterIdentityHandleFor = (mnemonic: string, passphrase = ""): string =>
  deriveIdentityHandle(mnemonic, passphrase);
