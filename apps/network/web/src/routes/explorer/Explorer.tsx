import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import type { AgentSkillContract, SkillPacket as ProtocolSkillPacket, SaySoSkillDocument } from "@sayso-labs/protocol/browser";
import type { AgentAddresses, StoredAgent, StoredIdentity } from "@sayso-labs/identity";
import { exploreSaySoAgent, type ExplorerProbeResult } from "../../xmtpExplorer.js";
import { CapabilityCards } from "../../components/CapabilityCards.js";
import { ChannelCards } from "../../components/ChannelCards.js";
import { SkillCardContent, SkillCards } from "../../components/SkillCards.js";
import { contentTypeName } from "../../components/util.js";
import { useEnvironment } from "../../state/environment.js";
import { useSetStatusContext } from "../../state/statusContext.js";
import {
  addressesForAgent,
  ethPrivateKeyForAgent,
  provisionAgent,
  provisionIdentity,
  readActiveAgentId,
  readActiveIdentityId,
  readStoredAgents,
  readStoredIdentities,
  writeActiveAgentId,
  writeActiveIdentityId,
  writeStoredAgents,
  writeStoredIdentities,
} from "../../state/identityStorage.js";

type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "error"; message: string };

export function Explorer() {
  const { address: addressParam } = useParams<{ address?: string }>();
  const [environment] = useEnvironment();
  const [identities, setIdentities] = useState<StoredIdentity[]>(readStoredIdentities);
  const [agents, setAgents] = useState<StoredAgent[]>(readStoredAgents);
  const [activeIdentityId, setActiveIdentityId] = useState<string | null>(readActiveIdentityId);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(readActiveAgentId);
  const [targetAddress, setTargetAddress] = useState(addressParam ?? "");
  const [result, setResult] = useState<LoadState<ExplorerProbeResult> | null>(null);

  const activeIdentity = useMemo(
    () => identities.find((entry) => entry.id === activeIdentityId) ?? identities[0] ?? null,
    [identities, activeIdentityId],
  );
  const identityAgents = useMemo(
    () => (activeIdentity ? agents.filter((entry) => entry.identityId === activeIdentity.id) : []),
    [activeIdentity, agents],
  );
  const activeAgent = useMemo(
    () => identityAgents.find((entry) => entry.id === activeAgentId) ?? identityAgents[0] ?? null,
    [identityAgents, activeAgentId],
  );
  const activeAddresses: AgentAddresses | null = useMemo(
    () => (activeIdentity && activeAgent ? addressesForAgent(activeIdentity, activeAgent) : null),
    [activeIdentity, activeAgent],
  );

  useSetStatusContext(
    activeIdentity && activeAgent && activeAddresses
      ? `${activeIdentity.label} / ${activeAgent.label} / ${activeAddresses.ethereum.address}`
      : "no identity",
  );

  useEffect(() => { writeStoredIdentities(identities); }, [identities]);
  useEffect(() => { writeStoredAgents(agents); }, [agents]);
  useEffect(() => { writeActiveIdentityId(activeIdentity?.id ?? null); }, [activeIdentity]);
  useEffect(() => { writeActiveAgentId(activeAgent?.id ?? null); }, [activeAgent]);

  const createIdentity = async () => {
    const label = `Identity ${identities.length + 1}`;
    const { identity, defaultAgent } = await provisionIdentity(label);
    setIdentities((current) => [identity, ...current]);
    setAgents((current) => [defaultAgent, ...current]);
    setActiveIdentityId(identity.id);
    setActiveAgentId(defaultAgent.id);
    setResult(null);
  };

  const addAgent = () => {
    if (!activeIdentity) return;
    const label = `Agent ${activeIdentity.nextAgentIndex}`;
    const { identity: updated, agent } = provisionAgent(activeIdentity, label);
    setIdentities((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
    setAgents((current) => [...current, agent]);
    setActiveAgentId(agent.id);
  };

  const startExplore = async () => {
    if (!activeIdentity || !activeAgent || !activeAddresses) {
      setResult({ status: "error", message: "Create an identity and agent before exploring." });
      return;
    }
    setResult({ status: "loading" });
    const caller = {
      ethAddress: activeAddresses.ethereum.address,
      ethPrivateKey: ethPrivateKeyForAgent(activeIdentity, activeAgent),
    };
    setResult({ status: "ready", value: await exploreSaySoAgent({ caller, env: environment, targetAddress }) });
  };

  return (
    <main className="explorer-page">
      <section className="explorer-toolbar" aria-label="Explorer controls">
        <button className="primary-button" onClick={createIdentity} type="button">
          <Plus size={15} />
          Create identity
        </button>
        {activeIdentity ? (
          <button className="secondary-button" onClick={addAgent} type="button">
            <Plus size={15} />
            Add agent
          </button>
        ) : null}
      </section>

      <section className="explorer-grid">
        <aside className="explorer-identities" aria-label="Identities and agents">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Identities</p>
              <h1 className="compact-title">Vaults</h1>
            </div>
            <span className="badge">{identities.length.toLocaleString()}</span>
          </div>
          {identities.length === 0 ? (
            <div className="list-state empty">Create an identity to start.</div>
          ) : (
            <div className="identity-list">
              {identities.map((identity) => (
                <button
                  className={identity.id === activeIdentity?.id ? "identity-row selected" : "identity-row"}
                  key={identity.id}
                  onClick={() => setActiveIdentityId(identity.id)}
                  type="button"
                >
                  <span className="address-line"><strong>{identity.label}</strong></span>
                  <span className="address-line" title={identity.identityHandle}>
                    <span>{identity.identityHandle}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {activeIdentity ? (
            <>
              <div className="section-heading" style={{ marginTop: "1rem" }}>
                <div>
                  <p className="eyebrow">Agents</p>
                  <h2 className="compact-title">Under {activeIdentity.label}</h2>
                </div>
                <span className="badge">{identityAgents.length.toLocaleString()}</span>
              </div>
              {identityAgents.length === 0 ? (
                <div className="list-state empty">Click "Add agent" to derive a new agent.</div>
              ) : (
                <div className="identity-list">
                  {identityAgents.map((agent) => {
                    const addresses = addressesForAgent(activeIdentity, agent);
                    return (
                      <button
                        className={agent.id === activeAgent?.id ? "identity-row selected" : "identity-row"}
                        key={`${agent.id}-${agent.index}`}
                        onClick={() => setActiveAgentId(agent.id)}
                        type="button"
                      >
                        <span className="address-line"><strong>{agent.label}</strong> (index {agent.index})</span>
                        <AddressLine label="ETH" value={addresses.ethereum.address} />
                        <AddressLine label="BTC" value={addresses.bitcoin.address} />
                        <AddressLine label="XRP" value={addresses.ripple.address} />
                        <AddressLine label="XLM" value={addresses.stellar.address} />
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : null}
        </aside>

        <section className="explorer-main" aria-label="Agent explorer">
          <div className="explorer-search">
            <label className="field">
              <span className="field-label">XMTP agent ETH address</span>
              <input
                className="field-input"
                value={targetAddress}
                onChange={(event) => setTargetAddress(event.target.value)}
                placeholder="0xc9F639A95813C834967FB8a38f749eA5F0b5CdD9"
              />
            </label>
            <button className="primary-button" disabled={result?.status === "loading"} onClick={startExplore} type="button">
              <Search size={15} />
              Explore
            </button>
          </div>
          <ExplorerResult state={result} />
        </section>
      </section>
    </main>
  );
}

function AddressLine({ label, value }: { label: string; value: string }) {
  return (
    <span className="address-line">
      <strong>{label}</strong>
      <span title={value}>{value}</span>
    </span>
  );
}

function ExplorerResult({ state }: { state: LoadState<ExplorerProbeResult> | null }) {
  if (!state) return <section className="detail-placeholder explorer-placeholder">Enter an agent address to inspect its first SaySo package.</section>;
  if (state.status === "loading") return <section className="detail-placeholder explorer-placeholder">Creating browser XMTP client...</section>;
  if (state.status === "error") return <section className="detail-placeholder error explorer-placeholder">{state.message}</section>;
  const result = state.value;
  if (result.status !== "sayso") {
    return (
      <section className="explorer-result">
        <div className="page-header">
          <div className="page-title-group">
            <p className="eyebrow">{result.status}</p>
            <h1 className="page-title">No SaySo agent package</h1>
          </div>
          <span className="badge">{result.env}</span>
        </div>
        <p className="description">{result.message}</p>
        <dl className="meta">
          <div><dt>Target</dt><dd>{result.targetAddress}</dd></div>
          {result.clientAddress ? <div><dt>Client address</dt><dd>{result.clientAddress}</dd></div> : null}
          {result.clientInboxId ? <div><dt>Client inbox</dt><dd>{result.clientInboxId}</dd></div> : null}
          {result.contentType ? <div><dt>Content type</dt><dd>{result.contentType}</dd></div> : null}
        </dl>
      </section>
    );
  }

  return (
    <section className="explorer-result">
      <div className="page-header">
        <div className="page-title-group">
          <p className="eyebrow">{result.package.contentType}</p>
          <h1 className="page-title">{result.package.agent.displayName}</h1>
        </div>
        <span className="badge">{result.package.kind}</span>
      </div>
      {"fallbackText" in result.package ? <p className="description">{result.package.fallbackText}</p> : null}
      <dl className="meta">
        <div><dt>Agent ID</dt><dd>{result.package.agent.agentId}</dd></div>
        <div><dt>Agent inbox</dt><dd>{result.package.agent.syncInboxId}</dd></div>
        <div><dt>Protocol</dt><dd>{result.package.protocolVersion}</dd></div>
        <div><dt>Supported versions</dt><dd>{result.package.supportedProtocolVersions.join(", ")}</dd></div>
        <div><dt>Client address</dt><dd>{result.clientAddress}</dd></div>
        <div><dt>Client inbox</dt><dd>{result.clientInboxId}</dd></div>
      </dl>
      <SkillContractSummary packet={result.package.skillPacket} />
    </section>
  );
}

function SkillContractSummary({ packet }: { packet: ProtocolSkillPacket }) {
  const contract = packet.skill as AgentSkillContract;
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);
  return (
    <>
      <section className="detail-section">
        <h2>Skills</h2>
        <SkillCards
          skills={packet.skills}
          renderCard={(skill: SaySoSkillDocument) => (
            <ExplorerSkillCard key={skill.skillId} skill={skill} />
          )}
        />
      </section>
      <section className="detail-section">
        <h2>Channels</h2>
        <ChannelCards channels={contract.channels} />
      </section>
      <section className="detail-section">
        <h2>Content types</h2>
        <div className="chips">
          {contract.contentTypes.map((contentType) => (
            <span key={contentTypeName(contentType)}>{contentTypeName(contentType)}</span>
          ))}
        </div>
      </section>
      <section className="detail-section">
        <h2>Payment policies</h2>
        <div className="chips">
          {contract.paymentPolicies.map((policy) => (
            <span key={policy.policyId}>
              {policy.policyId}: {policy.required ? "required" : "optional"}
            </span>
          ))}
        </div>
      </section>
      <section className="detail-section capabilities-section">
        <div className="detail-section-header">
          <div>
            <h2>Capabilities</h2>
            <p>
              {contract.capabilities.length.toLocaleString()} machine-readable{" "}
              {contract.capabilities.length === 1 ? "capability" : "capabilities"}
            </p>
          </div>
          <button
            aria-controls="packet-capabilities"
            aria-expanded={capabilitiesOpen}
            className="secondary-button"
            onClick={() => setCapabilitiesOpen((value) => !value)}
            type="button"
          >
            {capabilitiesOpen ? "Hide capabilities" : "Show capabilities"}
          </button>
        </div>
        {capabilitiesOpen ? <CapabilityCards capabilities={contract.capabilities} id="packet-capabilities" /> : null}
      </section>
    </>
  );
}

function ExplorerSkillCard({ skill }: { skill: SaySoSkillDocument }) {
  return (
    <span className="skill-card skill-card--static">
      <SkillCardContent skill={skill} />
    </span>
  );
}
