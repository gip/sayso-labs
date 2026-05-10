import { NavLink, Outlet } from "react-router-dom";
import { EnvironmentPill } from "../components/EnvironmentPill.js";
import { StatusBar } from "../components/StatusBar.js";
import { useEnvironment } from "../state/environment.js";
import { StatusProvider, useStatusContext } from "../state/statusContext.js";

export function Shell() {
  return (
    <StatusProvider>
      <ShellInner />
    </StatusProvider>
  );
}

function ShellInner() {
  const [environment, setEnvironment] = useEnvironment();
  const context = useStatusContext();

  return (
    <div className="shell">
      <header className="header">
        <div className="header-left">
          <NavLink to="/registry" className="header-logo" aria-label="SaySo Network home">
            <span className="header-mark">X</span>
            <span>SaySo Network</span>
          </NavLink>
          <nav className="primary-nav" aria-label="Primary">
            <NavLink to="/registry" className={navClass}>
              Registry
            </NavLink>
            <NavLink to="/explorer" className={navClass}>
              Explorer
            </NavLink>
            <NavLink to="/spec" className={navClass}>
              Spec
            </NavLink>
          </nav>
        </div>
        <div className="header-right">
          <EnvironmentPill environment={environment} onChange={setEnvironment} />
        </div>
      </header>

      <Outlet />

      <StatusBar context={context || "—"} environment={environment} />
    </div>
  );
}

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? "primary-nav-link active" : "primary-nav-link";
}
