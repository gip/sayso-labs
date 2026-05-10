import type { SaySoSkillDocument } from "@sayso-labs/protocol/browser";
import { CapabilityCards } from "./CapabilityCards.js";
import { ChannelCards } from "./ChannelCards.js";
import { contentTypeName } from "./util.js";

export function StructuredContract({ skill }: { skill: SaySoSkillDocument }) {
  const contract = skill.skill;
  return (
    <div className="structured-contract">
      <section>
        <h4>Capabilities</h4>
        <CapabilityCards capabilities={contract.capabilities} />
      </section>
      <section>
        <h4>Content types</h4>
        {contract.contentTypes.length > 0 ? (
          <div className="chips contract-chips">
            {contract.contentTypes.map((contentType) => (
              <span key={contentTypeName(contentType)}>{contentTypeName(contentType)}</span>
            ))}
          </div>
        ) : (
          <p className="empty-contract">No content types are declared.</p>
        )}
      </section>
      <section>
        <h4>Channels</h4>
        <ChannelCards channels={contract.channels} />
      </section>
      <section>
        <h4>Payment policies</h4>
        {contract.paymentPolicies.length > 0 ? (
          <div className="chips contract-chips">
            {contract.paymentPolicies.map((policy) => (
              <span key={policy.policyId}>
                {policy.policyId}: {policy.required ? "required" : "optional"}
              </span>
            ))}
          </div>
        ) : (
          <p className="empty-contract">No payment policies are declared.</p>
        )}
      </section>
      <section>
        <h4>Imports</h4>
        {skill.imports.length > 0 ? (
          <div className="chips contract-chips">
            {skill.imports.map((skillImport) => (
              <span key={`${skillImport.skillId}@${skillImport.version}`}>
                {skillImport.skillId}@{skillImport.version}
                {skillImport.required ? " required" : ""}
              </span>
            ))}
          </div>
        ) : (
          <p className="empty-contract">No imports are declared.</p>
        )}
      </section>
    </div>
  );
}
