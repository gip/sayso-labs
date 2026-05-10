import { useSearchParams } from "react-router-dom";
import type { RegistryEnvironment } from "../types.js";

export const useEnvironment = (): [RegistryEnvironment, (next: RegistryEnvironment) => void] => {
  const [searchParams, setSearchParams] = useSearchParams();
  const environment: RegistryEnvironment = searchParams.get("env") === "production" ? "production" : "dev";

  const setEnvironment = (next: RegistryEnvironment) => {
    setSearchParams(
      (current) => {
        const updated = new URLSearchParams(current);
        if (next === "production") updated.set("env", "production");
        else updated.delete("env");
        return updated;
      },
      { replace: false },
    );
  };

  return [environment, setEnvironment];
};
