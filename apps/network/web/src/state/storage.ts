import {
  createStoredExplorerIdentity,
  deriveExplorerIdentity,
  type ExplorerIdentity,
  type StoredExplorerIdentity,
} from "../explorerIdentity.js";

export const explorerStorageKey = "sayso:network-explorer:v1";
export const explorerActiveStorageKey = "sayso:network-explorer:active:v1";
export const sidebarCollapsedStorageKey = "sayso:network-sidebar-collapsed:v1";

export const readStoredExplorerIdentities = (): StoredExplorerIdentity[] => {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(explorerStorageKey) ?? "[]") as StoredExplorerIdentity[];
    return parsed.filter((identity) => /^[0-9a-f]{64}$/i.test(identity.seedHex));
  } catch {
    return [];
  }
};

export const readStoredExplorerActiveId = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(explorerActiveStorageKey);
  } catch {
    return null;
  }
};

export const readStoredSidebarCollapsed = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(sidebarCollapsedStorageKey) === "true";
  } catch {
    return false;
  }
};

export { createStoredExplorerIdentity, deriveExplorerIdentity };
export type { ExplorerIdentity, StoredExplorerIdentity };
