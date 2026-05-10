import { useEffect, useState } from "react";
import type { RegistryEnvironment } from "../types.js";

export function StatusBar({
  context,
  environment,
}: {
  context: string;
  environment: RegistryEnvironment;
}) {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <footer className="status-bar">
      <div className="status-bar-left">
        <span className="status-bar-context" title={context}>
          {context}
        </span>
      </div>
      <div className="status-bar-right">
        <span className="status-bar-env">{environment === "production" ? "production" : "dev"}</span>
        <span
          className={online ? "status-bar-dot status-bar-dot--online" : "status-bar-dot status-bar-dot--offline"}
          title={online ? "Online" : "Offline"}
          aria-label={online ? "Online" : "Offline"}
        />
      </div>
    </footer>
  );
}
