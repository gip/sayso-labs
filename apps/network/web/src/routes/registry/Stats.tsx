import type { RegistryStats } from "../../types.js";

export function Stats({ stats }: { stats: RegistryStats }) {
  return (
    <div className="stats-row" aria-label="Registry stats">
      <Stat label="Total" value={stats.total} />
      <Stat label="Public" value={stats.public} />
      <Stat label="Private" value={stats.private} />
      <Stat label="Premium" value={stats.premium} />
      <Stat label="Skills" value={stats.disclosedSkillPacket} />
    </div>
  );
}

function Stat({ label, value = 0 }: { label: string; value?: number }) {
  return (
    <div className="stat-chip">
      <span className="stat-chip-label">{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
}
