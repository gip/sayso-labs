export const sidebarCollapsedStorageKey = "sayso:network-sidebar-collapsed:v1";

export const readStoredSidebarCollapsed = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(sidebarCollapsedStorageKey) === "true";
  } catch {
    return false;
  }
};
