import { useOutletContext } from "react-router-dom";
import { useSetStatusContext } from "../../state/statusContext.js";
import type { RegistryOutletContext } from "./RegistryLayout.js";
import { Stats } from "./Stats.js";

export function RegistryIndex() {
  useSetStatusContext("registry");
  const { stats } = useOutletContext<RegistryOutletContext>();
  return (
    <section className="detail-page">
      <Stats stats={stats} />
      <div className="detail-placeholder">Select an agent.</div>
    </section>
  );
}
