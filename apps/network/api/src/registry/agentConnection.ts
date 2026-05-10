import { isAddress, verifyMessage } from "viem";
import { isRecord, type ClaimPresentation, type VerifiedClaim } from "@sayso-labs/protocol";

export const AGENT_CONNECTION_CLAIM_TYPE = "sayso.claim.agent-connection";

type AgentConnectionFields = {
  requesterType: string;
  requesterAddress: string;
  agentType: string;
  agentAddress: string;
  signatureScheme?: string;
  canonicalMessage: string;
  presentation: Record<string, unknown>;
};

export type AgentConnectionVerification =
  | ({ status: "verified"; verifiedClaim: VerifiedClaim } & AgentConnectionFields)
  | ({ status: "failed"; errorMessage: string } & AgentConnectionFields)
  | ({ status: "malformed" | "unsupported"; errorMessage: string } & Partial<AgentConnectionFields>);

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
};

export const canonicalJson = (value: unknown) => JSON.stringify(canonicalize(value));

const stringField = (record: Record<string, unknown>, key: string) => {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
};

const signatureMatchesRequester = (
  signature: Record<string, unknown>,
  requesterType: string,
  requesterAddress: string,
) =>
  typeof signature.type === "string" &&
  typeof signature.address === "string" &&
  signature.type.toLowerCase() === requesterType.toLowerCase() &&
  signature.address.toLowerCase() === requesterAddress.toLowerCase();

export const verifyAgentConnectionPresentation = async (
  presentation: ClaimPresentation,
): Promise<AgentConnectionVerification> => {
  if (presentation.type !== AGENT_CONNECTION_CLAIM_TYPE) {
    return { status: "unsupported", errorMessage: "Unsupported presentation type." };
  }
  const payload = presentation.payload;
  if (!isRecord(payload.message)) return { status: "malformed", errorMessage: "Agent connection message must be an object." };
  if (!isRecord(payload.message.requester)) return { status: "malformed", errorMessage: "Agent connection requester must be an object." };
  if (!isRecord(payload.message.agent)) return { status: "malformed", errorMessage: "Agent connection agent must be an object." };
  if (!Array.isArray(payload.signatures) || payload.signatures.length === 0) {
    return { status: "malformed", errorMessage: "Agent connection signatures must be a non-empty array." };
  }

  const requesterType = stringField(payload.message.requester, "type");
  const requesterAddress = stringField(payload.message.requester, "address");
  const agentType = stringField(payload.message.agent, "type");
  const agentAddress = stringField(payload.message.agent, "address");
  if (!requesterType || !requesterAddress) {
    return { status: "malformed", errorMessage: "Agent connection requester type and address are required." };
  }
  if (!agentType || !agentAddress) {
    return { status: "malformed", errorMessage: "Agent connection agent type and address are required." };
  }
  if (payload.message.claim !== "I want to connect to this SaySo agent") {
    return { status: "malformed", errorMessage: "Agent connection claim text is invalid." };
  }
  if (typeof payload.message.timestamp !== "string" || payload.message.timestamp.length === 0) {
    return { status: "malformed", errorMessage: "Agent connection timestamp is required." };
  }

  const fields: AgentConnectionFields = {
    requesterType,
    requesterAddress,
    agentType,
    agentAddress,
    canonicalMessage: canonicalJson(payload.message),
    presentation: presentation as unknown as Record<string, unknown>,
  };

  if (requesterType !== "ethereum" || agentType !== "ethereum") {
    return { ...fields, status: "unsupported", errorMessage: "Agent connection verification supports ethereum addresses only." };
  }
  if (!isAddress(requesterAddress) || !isAddress(agentAddress)) {
    return { ...fields, status: "malformed", errorMessage: "Agent connection requester and agent addresses must be valid Ethereum addresses." };
  }

  const matchingSignatures = payload.signatures.filter((signature): signature is Record<string, unknown> =>
    isRecord(signature) && signatureMatchesRequester(signature, requesterType, requesterAddress),
  );
  if (!matchingSignatures.length) {
    return { ...fields, status: "failed", errorMessage: "No signature matched the requester address." };
  }

  const eip191Signatures = matchingSignatures.filter((signature) => signature.signatureScheme === "eip191");
  if (!eip191Signatures.length) {
    return { ...fields, status: "unsupported", errorMessage: "Agent connection verification supports eip191 signatures only." };
  }

  for (const signature of eip191Signatures) {
    if (typeof signature.signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(signature.signature)) {
      return { ...fields, signatureScheme: "eip191", status: "malformed", errorMessage: "Agent connection signature must be a hex string." };
    }
    const valid = await verifyMessage({
      address: requesterAddress,
      message: fields.canonicalMessage,
      signature: signature.signature as `0x${string}`,
    }).catch(() => false);
    if (valid) {
      return {
        ...fields,
        signatureScheme: "eip191",
        status: "verified",
        verifiedClaim: {
          type: AGENT_CONNECTION_CLAIM_TYPE,
          subject: {
            type: requesterType,
            address: requesterAddress,
          },
          status: "verified",
          verifiedAt: new Date().toISOString(),
          payload: {
            agent: {
              type: agentType,
              address: agentAddress,
            },
          },
        },
      };
    }
  }

  return {
    ...fields,
    signatureScheme: "eip191",
    status: "failed",
    errorMessage: "Agent connection signature could not be verified.",
  };
};
