import type { RegistryEnvironment } from "../types.js";

export function EnvironmentPill({
  environment,
  onChange,
}: {
  environment: RegistryEnvironment;
  onChange: (value: RegistryEnvironment) => void;
}) {
  const isProd = environment === "production";
  return (
    <div
      className={isProd ? "env-pill env-pill--prod" : "env-pill"}
      role="group"
      aria-label="Network environment"
    >
      <button
        aria-pressed={!isProd}
        className={!isProd ? "env-pill-button selected" : "env-pill-button"}
        onClick={() => onChange("dev")}
        type="button"
      >
        Dev
      </button>
      <button
        aria-pressed={isProd}
        className={isProd ? "env-pill-button selected" : "env-pill-button"}
        onClick={() => onChange("production")}
        type="button"
      >
        Prod
      </button>
    </div>
  );
}
