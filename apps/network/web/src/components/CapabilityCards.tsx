import type { AgentSkillContract } from "@sayso-labs/protocol/browser";

export function CapabilityCards({
  capabilities,
  id,
}: {
  capabilities: AgentSkillContract["capabilities"];
  id?: string;
}) {
  if (capabilities.length === 0) return <p className="empty-contract" id={id}>No capabilities are declared.</p>;
  return (
    <div className="summary-list" id={id}>
      {capabilities.map((capability) => (
        <div className="summary-row contract-row" key={capability.capabilityId}>
          <strong>{capability.title}</strong>
          <span>{capability.capabilityId}</span>
          <p>{capability.description}</p>
          <dl className="contract-meta">
            <div>
              <dt>Requests</dt>
              <dd>{capability.requestContentTypes.join(", ") || "none"}</dd>
            </div>
            <div>
              <dt>Responses</dt>
              <dd>{capability.responseContentTypes.join(", ") || "none"}</dd>
            </div>
            <div>
              <dt>Channels</dt>
              <dd>{capability.channels.join(", ") || "none"}</dd>
            </div>
            <div>
              <dt>Payment</dt>
              <dd>{capability.paymentPolicy}</dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}
