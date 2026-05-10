import { spawn } from "node:child_process";

export const DEFAULT_LOCAL_BACKEND_URL = process.env.SAYSO_LOCAL_BACKEND_URL ?? "http://127.0.0.1:8787";

export const localBackendHealthUrl = (baseUrl = DEFAULT_LOCAL_BACKEND_URL) =>
  new URL("/api/health", baseUrl).toString();

export const fetchLocalBackendHealth = async (baseUrl = DEFAULT_LOCAL_BACKEND_URL) => {
  const response = await fetch(localBackendHealthUrl(baseUrl));
  if (!response.ok) throw new Error(`SaySo personal service health check failed: HTTP ${response.status}`);
  return response.json() as Promise<Record<string, unknown>>;
};

export const startLocalBackend = async (input: {
  baseUrl?: string;
  command?: string;
  timeoutMs?: number;
} = {}) => {
  const baseUrl = input.baseUrl ?? DEFAULT_LOCAL_BACKEND_URL;
  try {
    return await fetchLocalBackendHealth(baseUrl);
  } catch {
    // Continue and start the backend below.
  }

  const command = input.command ?? process.env.SAYSO_LOCAL_BACKEND_COMMAND ?? "sayso-personal-service";
  const child = spawn(command, {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();

  const deadline = Date.now() + (input.timeoutMs ?? 10_000);
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      return await fetchLocalBackendHealth(baseUrl);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Timed out waiting for SaySo personal service.");
};

export const stopLocalBackend = async (baseUrl = DEFAULT_LOCAL_BACKEND_URL) => {
  const response = await fetch(new URL("/api/shutdown", baseUrl), { method: "POST" });
  if (!response.ok) throw new Error(`SaySo personal service shutdown failed: HTTP ${response.status}`);
  return response.json() as Promise<Record<string, unknown>>;
};
