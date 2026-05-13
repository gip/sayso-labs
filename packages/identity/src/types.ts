export type ChainType = "ethereum" | "bitcoin" | "ripple" | "stellar";

export type AgentAddress = {
  type: ChainType;
  address: string;
  derivationPath: string;
};

export type AgentAddresses = {
  ethereum: AgentAddress & { type: "ethereum"; address: `0x${string}` };
  bitcoin: AgentAddress & { type: "bitcoin" };
  ripple: AgentAddress & { type: "ripple" };
  stellar: AgentAddress & { type: "stellar" };
};

export type EncryptedBlob = {
  kdf: "pbkdf2-sha256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

export type StoredIdentity = {
  id: string;
  label: string;
  createdAt: string;
  identityHandle: string;
  nextAgentIndex: number;
  mnemonic:
    | { kind: "plaintext"; mnemonic: string }
    | { kind: "encrypted"; blob: EncryptedBlob };
};

export type UnlockedIdentity = StoredIdentity & {
  mnemonicPlaintext: string;
};

export type StoredAgent = {
  id: string;
  identityId: string;
  index: number;
  label: string;
  createdAt: string;
};

export type AgentRecord = StoredAgent & {
  addresses: AgentAddresses;
};

export type WalletControlSignature = {
  type: ChainType;
  address: string;
  signatureScheme: string;
  signature: string;
};

export type WalletControlPresentation = {
  type: "sayso.claim.wallet-control";
  payload: {
    message: {
      claim: "I control these wallets";
      wallets: Array<{ type: ChainType; address: string }>;
      timestamp: string;
    };
    signatures: WalletControlSignature[];
  };
};

export type AgentRosterPresentation = {
  type: "sayso.identity.agent-roster";
  payload: {
    identityHandle: string;
    agents: Array<{
      index: number;
      label?: string;
      addresses: AgentAddress[];
    }>;
    timestamp: string;
  };
};
