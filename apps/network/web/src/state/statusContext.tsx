import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

interface StatusContextValue {
  context: string;
  setContext: (value: string) => void;
}

const StatusContext = createContext<StatusContextValue | null>(null);

export function StatusProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState("");
  const value: StatusContextValue = { context, setContext };
  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
}

export function useStatusContext(): string {
  const value = useContext(StatusContext);
  return value?.context ?? "";
}

export function useSetStatusContext(initial?: string) {
  const value = useContext(StatusContext);
  const setter = value?.setContext;

  const setContext = useCallback((next: string) => {
    setter?.(next);
  }, [setter]);

  useEffect(() => {
    if (initial !== undefined) setter?.(initial);
    return () => setter?.("");
  }, [initial, setter]);

  return setContext;
}
