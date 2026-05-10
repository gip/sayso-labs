import { useEffect, useState } from "react";
import { Link, useLocation, useOutletContext, useParams } from "react-router-dom";
import { fetchAgent } from "../../api.js";
import type { NetworkAgentRecord } from "../../types.js";
import { SkillCardContent, SkillCards } from "../../components/SkillCards.js";
import { useEnvironment } from "../../state/environment.js";
import { useSetStatusContext } from "../../state/statusContext.js";
import { Stats } from "./Stats.js";
import type { RegistryOutletContext } from "./RegistryLayout.js";

type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "error"; message: string };

export function AgentDetail() {
  const { agentId } = useParams<{ agentId: string }>();
  const [environment] = useEnvironment();
  const location = useLocation();
  const { stats } = useOutletContext<RegistryOutletContext>();
  const [state, setState] = useState<LoadState<NetworkAgentRecord>>({ status: "loading" });

  useEffect(() => {
    if (!agentId) return;
    setState({ status: "loading" });
    fetchAgent(environment, agentId)
      .then((value) => setState({ status: "ready", value }))
      .catch((error: Error) => setState({ status: "error", message: error.message }));
  }, [agentId, environment]);

  useSetStatusContext(agentId ?? "registry");

  if (state.status === "loading")
    return (
      <section className="detail-page">
        <Stats stats={stats} />
        <div className="detail-placeholder">Loading agent...</div>
      </section>
    );
  if (state.status === "error")
    return (
      <section className="detail-page">
        <Stats stats={stats} />
        <div className="detail-placeholder error">{state.message}</div>
      </section>
    );

  const record = state.value;
  const claimTypes = record.claimTypes ?? [];
  const skills = record.skillPacket?.skills ?? [];
  const skillStatus = (skillId: string, version: string) =>
    record.skillStatuses?.find((status) => status.skillId === skillId && status.version === version);
  const search = location.search;

  return (
    <section className="detail-page">
      <Stats stats={stats} />
      <div className="page-header">
        <div className="page-title-group">
          <p className="eyebrow">Public agent</p>
          <h1 className="page-title">{record.agent.displayName}</h1>
          <p className="modal-subtitle">{record.agent.agentId}</p>
        </div>
        <span className="badge">
          {record.listingTier === "premium"
            ? "Premium"
            : record.skillDisclosure === "include-skill-packet"
              ? "Skills visible"
              : "Summary only"}
        </span>
      </div>
      <p className="description">{record.description}</p>
      {claimTypes.length > 0 ? (
        <section className="detail-section">
          <h2>Claim types</h2>
          <div className="chips">
            {claimTypes.map((claimType) => (
              <span key={claimType}>{claimType}</span>
            ))}
          </div>
        </section>
      ) : null}
      <dl className="meta">
        <div>
          <dt>Wallet address</dt>
          <dd>{record.walletAddress}</dd>
        </div>
        <div>
          <dt>Short name</dt>
          <dd>{record.agent.displayName}</dd>
        </div>
        <div>
          <dt>Global ID</dt>
          <dd>{record.agent.agentId}</dd>
        </div>
        <div>
          <dt>Connections</dt>
          <dd>{record.connectionCount.toLocaleString()}</dd>
        </div>
        {record.premiumExpiresAt ? (
          <div>
            <dt>Premium until</dt>
            <dd>{new Date(record.premiumExpiresAt).toLocaleString()}</dd>
          </div>
        ) : null}
        <div>
          <dt>Updated</dt>
          <dd>{new Date(record.updatedAt).toLocaleString()}</dd>
        </div>
      </dl>
      {record.skillDisclosure === "summary-only" ? (
        <div className="notice">This public registration does not disclose a skill packet.</div>
      ) : (
        <section className="detail-section">
          <h2>Skills</h2>
          <SkillCards
            skills={skills}
            renderCard={(skill) => (
              <Link
                key={skill.skillId}
                className="skill-card"
                to={`/registry/${record.agent.agentId}/skills/${encodeURIComponent(skill.skillId)}${search}`}
              >
                <SkillCardContent skill={skill} status={skillStatus(skill.skillId, skill.version)} />
              </Link>
            )}
          />
        </section>
      )}
    </section>
  );
}
