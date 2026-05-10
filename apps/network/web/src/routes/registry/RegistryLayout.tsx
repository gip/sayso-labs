import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { PanelLeft } from "lucide-react";
import { fetchAgents, fetchStats } from "../../api.js";
import type { AgentListResponse, RegistryStats } from "../../types.js";
import { useEnvironment } from "../../state/environment.js";
import { readStoredSidebarCollapsed, sidebarCollapsedStorageKey } from "../../state/storage.js";

const emptyStats: RegistryStats = { total: 0, public: 0, private: 0, disclosedSkillPacket: 0, premium: 0 };

type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "error"; message: string };

export function RegistryLayout() {
  const [environment] = useEnvironment();
  const params = useParams<{ agentId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [stats, setStats] = useState<LoadState<RegistryStats>>({ status: "loading" });
  const [agents, setAgents] = useState<LoadState<AgentListResponse>>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [skillIds, setSkillIds] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(readStoredSidebarCollapsed);

  const filters = useMemo(() => ({ environment, query, skillIds }), [environment, query, skillIds]);

  useEffect(() => {
    setStats({ status: "loading" });
    void fetchStats(environment)
      .then((value) => setStats({ status: "ready", value }))
      .catch((error: Error) => setStats({ status: "error", message: error.message }));
  }, [environment]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setAgents({ status: "loading" });
      void fetchAgents(filters)
        .then((value) => {
          setAgents({ status: "ready", value });
          const inList = value.results.some((record) => record.agent.agentId === params.agentId);
          if (!inList && value.results[0]) {
            navigate(`/registry/${value.results[0].agent.agentId}${location.search}`, { replace: true });
          } else if (value.results.length === 0 && params.agentId) {
            navigate(`/registry${location.search}`, { replace: true });
          }
        })
        .catch((error: Error) => setAgents({ status: "error", message: error.message }));
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [filters, navigate, params.agentId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(sidebarCollapsedStorageKey, collapsed ? "true" : "false");
    } catch {
      // localStorage can be unavailable in constrained browser contexts.
    }
  }, [collapsed]);

  const resolvedStats = stats.status === "ready" ? stats.value : emptyStats;
  const layoutClasses = ["app-layout"];
  if (mobileOpen) layoutClasses.push("app-layout--mobile-open");
  if (collapsed) layoutClasses.push("app-layout--sidebar-collapsed");

  return (
    <div className={layoutClasses.join(" ")}>
      <button
        className="sidebar-toggle"
        onClick={() => {
          setCollapsed((prev) => !prev);
          setMobileOpen((prev) => !prev);
        }}
        type="button"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <PanelLeft size={14} />
      </button>
      {mobileOpen ? (
        <button
          className="sidebar-backdrop"
          aria-label="Close registry sidebar"
          type="button"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
      <RegistrySidebar
        agents={agents}
        query={query}
        skillIds={skillIds}
        selectedId={params.agentId}
        setQuery={setQuery}
        setSkillIds={setSkillIds}
        onSelect={(id) => {
          navigate({ pathname: `/registry/${id}`, search: location.search });
          setMobileOpen(false);
        }}
      />
      <main className="app-content">
        <Outlet context={{ stats: resolvedStats, agents }} />
      </main>
    </div>
  );
}

function RegistrySidebar({
  agents,
  query,
  skillIds,
  selectedId,
  setQuery,
  setSkillIds,
  onSelect,
}: {
  agents: LoadState<AgentListResponse>;
  query: string;
  skillIds: string;
  selectedId?: string;
  setQuery: (value: string) => void;
  setSkillIds: (value: string) => void;
  onSelect: (agentId: string) => void;
}) {
  return (
    <aside className="sidebar" aria-label="Agent registry">
      <section className="filters" aria-label="Agent filters">
        <label className="field">
          <span className="field-label">Search</span>
          <input
            className="field-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="name, id, description"
          />
        </label>
        <label className="field">
          <span className="field-label">Skill IDs</span>
          <input
            className="field-input"
            value={skillIds}
            onChange={(event) => setSkillIds(event.target.value)}
            placeholder="sayso.network,sayso.payment"
          />
        </label>
      </section>
      <AgentList state={agents} selectedId={selectedId} onSelect={onSelect} />
    </aside>
  );
}

function AgentList({
  state,
  selectedId,
  onSelect,
}: {
  state: LoadState<AgentListResponse>;
  selectedId?: string;
  onSelect: (agentId: string) => void;
}) {
  if (state.status === "loading") return <div className="list-state">Loading public agents...</div>;
  if (state.status === "error") return <div className="list-state error">{state.message}</div>;
  if (state.value.results.length === 0)
    return <div className="list-state empty">No public agents match the current filters.</div>;
  return (
    <section className="agent-list" aria-label="Public agents">
      <div className="table-head">
        <span>Agent</span>
        <span>Protocol</span>
        <span>Conn.</span>
        <span>Disclosure</span>
      </div>
      {state.value.results.map((record) => (
        <button
          className={record.agent.agentId === selectedId ? "agent-row selected" : "agent-row"}
          key={record.registrationId}
          onClick={() => onSelect(record.agent.agentId)}
          type="button"
        >
          <span className="agent-row-main">
            <strong>
              {record.agent.displayName}
              {record.listingTier === "premium" ? <span className="inline-badge">Premium</span> : null}
            </strong>
            <small>Global ID</small>
            <small>{record.agent.agentId}</small>
          </span>
          <span className="agent-row-meta">{record.agent.protocolVersion}</span>
          <span className="agent-row-meta">{record.connectionCount.toLocaleString()}</span>
          <span className="agent-row-meta">
            {record.skillDisclosure === "include-skill-packet" ? "Skill packet" : "Summary"}
          </span>
        </button>
      ))}
    </section>
  );
}

export interface RegistryOutletContext {
  stats: RegistryStats;
  agents: LoadState<AgentListResponse>;
}
