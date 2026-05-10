import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./layouts/Shell.js";
import { RegistryLayout } from "./routes/registry/RegistryLayout.js";
import { RegistryIndex } from "./routes/registry/RegistryIndex.js";
import { AgentDetail } from "./routes/registry/AgentDetail.js";
import { SkillReader } from "./routes/registry/SkillReader.js";
import { Explorer } from "./routes/explorer/Explorer.js";
import { Spec } from "./routes/Spec.js";
import "./styles.css";

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Navigate to="/registry" replace />} />
        <Route path="registry" element={<RegistryLayout />}>
          <Route index element={<RegistryIndex />} />
          <Route path=":agentId" element={<AgentDetail />} />
          <Route path=":agentId/skills/:skillId" element={<SkillReader />} />
        </Route>
        <Route path="explorer" element={<Explorer />}>
          <Route path=":address" element={null} />
        </Route>
        <Route path="spec" element={<Spec />} />
        <Route path="*" element={<Navigate to="/registry" replace />} />
      </Route>
    </Routes>
  );
}
