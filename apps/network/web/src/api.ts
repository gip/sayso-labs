import type {
  AgentListResponse,
  NetworkAgentRecord,
  RegistryEnvironment,
  RegistryEnvironmentResponse,
  RegistryStats,
} from "./types.js";

const requestJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
};

export const fetchEnvironments = () => requestJson<RegistryEnvironmentResponse>("/api/environments");

export const fetchStats = (environment: RegistryEnvironment) =>
  requestJson<RegistryStats>(`/api/stats?env=${encodeURIComponent(environment)}`);

export const fetchAgents = (input: {
  environment: RegistryEnvironment;
  query?: string;
  skillIds?: string;
  cursor?: string;
}) => {
  const params = new URLSearchParams();
  params.set("env", input.environment);
  if (input.query) params.set("query", input.query);
  if (input.skillIds) params.set("skillIds", input.skillIds);
  if (input.cursor) params.set("cursor", input.cursor);
  params.set("limit", "25");
  return requestJson<AgentListResponse>(`/api/agents?${params}`);
};

export const fetchAgent = (environment: RegistryEnvironment, agentId: string) => {
  const params = new URLSearchParams({ env: environment });
  return requestJson<NetworkAgentRecord>(`/api/agents/${encodeURIComponent(agentId)}?${params}`);
};
