import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import Markdown from "react-markdown";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import { fetchAgent } from "../../api.js";
import type { NetworkAgentRecord } from "../../types.js";
import { StructuredContract } from "../../components/StructuredContract.js";
import { extractFrontmatterDescription } from "../../components/util.js";
import { useEnvironment } from "../../state/environment.js";
import { useSetStatusContext } from "../../state/statusContext.js";

type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "error"; message: string };

export function SkillReader() {
  const { agentId, skillId } = useParams<{ agentId: string; skillId: string }>();
  const [environment] = useEnvironment();
  const location = useLocation();
  const decodedSkillId = skillId ? decodeURIComponent(skillId) : undefined;
  const [state, setState] = useState<LoadState<NetworkAgentRecord>>({ status: "loading" });
  const [contractOpen, setContractOpen] = useState(false);
  const search = location.search;

  useEffect(() => {
    if (!agentId) return;
    setState({ status: "loading" });
    fetchAgent(environment, agentId)
      .then((value) => setState({ status: "ready", value }))
      .catch((error: Error) => setState({ status: "error", message: error.message }));
  }, [agentId, environment]);

  useSetStatusContext(decodedSkillId ?? "skill");

  if (state.status === "loading")
    return <section className="detail-page"><div className="detail-placeholder">Loading agent...</div></section>;
  if (state.status === "error")
    return <section className="detail-page"><div className="detail-placeholder error">{state.message}</div></section>;

  const record = state.value;
  const skill = record.skillPacket?.skills.find((entry) => entry.skillId === decodedSkillId);
  const status = skill
    ? record.skillStatuses?.find((entry) => entry.skillId === skill.skillId && entry.version === skill.version)
    : undefined;

  if (!skill) {
    return (
      <section className="detail-page">
        <Breadcrumb agentId={record.agent.agentId} agentName={record.agent.displayName} skillName={decodedSkillId ?? ""} search={search} />
        <div className="detail-placeholder error">Skill not found.</div>
      </section>
    );
  }

  const description = extractFrontmatterDescription(skill.content);

  return (
    <section className="detail-page detail-page--reader">
      <Breadcrumb agentId={record.agent.agentId} agentName={record.agent.displayName} skillName={skill.name} search={search} />
      <div className="page-header">
        <div className="page-title-group">
          <p className="eyebrow">{skill.kind} skill</p>
          <h1 className="page-title">{skill.name}</h1>
          <p className="modal-subtitle">{skill.skillId}@{skill.version}</p>
          {description ? <p className="modal-description">{description}</p> : null}
        </div>
        <span className="page-header-actions">
          {status ? <span className={`skill-status skill-status--${status.status}`}>{statusLabel[status.status]}</span> : null}
          <span className="badge">{skill.mediaType}</span>
        </span>
      </div>

      <section className="detail-section">
        <div className="section-heading compact" style={{ borderBottom: "none", padding: 0, marginBottom: 8 }}>
          <div>
            <p className="eyebrow">Normative source</p>
            <h2 style={{ margin: 0 }}>Skill content</h2>
          </div>
        </div>
        <div className="markdown-view markdown-view--inline">
          {skill.content ? (
            <Markdown remarkPlugins={[remarkFrontmatter, remarkGfm]} skipHtml>
              {skill.content}
            </Markdown>
          ) : (
            <p>No markdown content was provided for this skill.</p>
          )}
        </div>
      </section>

      <details className="contract-details" open={contractOpen}>
        <summary
          onClick={(event) => {
            event.preventDefault();
            setContractOpen((value) => !value);
          }}
        >
          <span>Structured contract</span>
          <small>Capabilities and machine-readable metadata</small>
        </summary>
        {contractOpen ? <StructuredContract skill={skill} /> : null}
      </details>
    </section>
  );
}

const statusLabel = {
  reference: "Reference",
  modified: "Modified",
  custom: "Custom",
} as const;

function Breadcrumb({
  agentId,
  agentName,
  skillName,
  search,
}: {
  agentId: string;
  agentName: string;
  skillName: string;
  search: string;
}) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <Link to={`/registry${search}`}>Registry</Link>
      <span className="breadcrumb-sep">/</span>
      <Link to={`/registry/${agentId}${search}`}>{agentName}</Link>
      <span className="breadcrumb-sep">/</span>
      <span aria-current="page">{skillName}</span>
    </nav>
  );
}
