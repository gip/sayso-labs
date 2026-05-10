import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import type { AgentSkillContract, SkillPacket as ProtocolSkillPacket, SaySoSkillDocument } from "@sayso-labs/protocol/browser";
import { exploreSaySoAgent, type ExplorerProbeResult } from "../../xmtpExplorer.js";
import { CapabilityCards } from "../../components/CapabilityCards.js";
import { ChannelCards } from "../../components/ChannelCards.js";
import { SkillCardContent, SkillCards } from "../../components/SkillCards.js";
import { contentTypeName } from "../../components/util.js";
import { useEnvironment } from "../../state/environment.js";
import { useSetStatusContext } from "../../state/statusContext.js";
import {
  createStoredExplorerIdentity,
  deriveExplorerIdentity,
  explorerActiveStorageKey,
  explorerStorageKey,
  readStoredExplorerActiveId,
  readStoredExplorerIdentities,
  type StoredExplorerIdentity,
} from "../../state/storage.js";

type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "error"; message: string };

export function Explorer() {
  const { address: addressParam } = useParams<{ address?: string }>();
  const [environment] = useEnvironment();
  const [storedIdentities, setStoredIdentities] = useState<StoredExplorerIdentity[]>(readStoredExplorerIdentities);
  const [activeId, setActiveId] = useState<string | null>(readStoredExplorerActiveId);
  const [targetAddress, setTargetAddress] = useState(addressParam ?? "");
  const [result, setResult] = useState<LoadState<ExplorerProbeResult> | null>(null);

  const identities = useMemo(() => storedIdentities.map(deriveExplorerIdentity), [storedIdentities]);
  const activeIdentity = identities.find((identity) => identity.id === activeId) ?? identities[0] ?? null;

  useSetStatusContext(activeIdentity ? activeIdentity.addresses.eth : "no explorer address");

  useEffect(() => {
    try {
      window.localStorage.setItem(explorerStorageKey, JSON.stringify(storedIdentities));
    } catch {
      // localStorage can be unavailable in constrained browser contexts.
    }
  }, [storedIdentities]);

  useEffect(() => {
    try {
      if (activeIdentity) window.localStorage.setItem(explorerActiveStorageKey, activeIdentity.id);
      else window.localStorage.removeItem(explorerActiveStorageKey);
    } catch {
      // localStorage can be unavailable in constrained browser contexts.
    }
  }, [activeIdentity]);

  const createIdentity = () => {
    const stored = createStoredExplorerIdentity();
    setStoredIdentities((current) => [stored, ...current]);
    setActiveId(stored.id);
    setResult(null);
  };

  const startExplore = async () => {
    if (!activeIdentity) {
      setResult({ status: "error", message: "Create an address before exploring." });
      return;
    }
    setResult({ status: "loading" });
    setResult({ status: "ready", value: await exploreSaySoAgent({ identity: activeIdentity, env: environment, targetAddress }) });
  };

  return (
    <main className="explorer-page">
      <section className="explorer-toolbar" aria-label="Explorer controls">
        <button className="primary-button" onClick={createIdentity} type="button">
          <Plus size={15} />
          Create address
        </button>
      </section>

      <section className="explorer-grid">
        <aside className="explorer-identities" aria-label="Generated addresses">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Generated identities</p>
              <h1 className="compact-title">Addresses</h1>
            </div>
            <span className="badge">{identities.length.toLocaleString()}</span>
          </div>
          {identities.length === 0 ? (
            <div className="list-state empty">Create an address to start exploring.</div>
          ) : (
            <div className="identity-list">
              {identities.map((identity) => (
                <button
                  className={identity.id === activeIdentity?.id ? "identity-row selected" : "identity-row"}
                  key={identity.id}
                  onClick={() => setActiveId(identity.id)}
                  type="button"
                >
                  <AddressLine label="ETH" value={identity.addresses.eth} />
                  <AddressLine label="BTC" value={identity.addresses.btc} />
                  <AddressLine label="XRP" value={identity.addresses.xrp} />
                  <AddressLine label="XLM" value={identity.addresses.xlm} />
                </button>
              ))}
            </div>
          )}
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
