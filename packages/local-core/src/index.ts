import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export const DEFAULT_LOCAL_BACKEND_HOST = "127.0.0.1";
export const DEFAULT_LOCAL_BACKEND_PORT = 8787;

export type SaySoLocalPaths = {
  home: string;
  sqlite: string;
  xmtp: string;
  logs: string;
  runtime: string;
};

export const resolveSaySoHome = (env: NodeJS.ProcessEnv = process.env) =>
  env.SAYSO_HOME && env.SAYSO_HOME.length > 0
    ? env.SAYSO_HOME
    : path.join(homedir(), "Library", "Application Support", "SaySo");

export const resolveLocalPaths = (env: NodeJS.ProcessEnv = process.env): SaySoLocalPaths => {
  const home = resolveSaySoHome(env);
  return {
    home,
    sqlite: path.join(home, "sayso.sqlite"),
    xmtp: path.join(home, "xmtp"),
    logs: path.join(home, "logs"),
    runtime: path.join(home, "runtime"),
  };
};

export const ensureLocalPaths = (env: NodeJS.ProcessEnv = process.env): SaySoLocalPaths => {
  const paths = resolveLocalPaths(env);
  mkdirSync(paths.home, { recursive: true });
  mkdirSync(paths.xmtp, { recursive: true });
  mkdirSync(paths.logs, { recursive: true });
  mkdirSync(paths.runtime, { recursive: true });
  return paths;
};
