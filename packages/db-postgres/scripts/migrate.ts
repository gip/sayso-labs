import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const findWorkspaceRoot = () => {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../.."),
    path.resolve(process.cwd(), "../../.."),
  ];
  return candidates.find((candidate) => existsSync(path.join(candidate, "pnpm-workspace.yaml"))) ?? process.cwd();
};

const loadEnvFiles = () => {
  const workspaceRoot = findWorkspaceRoot();
  const packageRoot = path.resolve(workspaceRoot, "packages/db-postgres");
  const files = [
    { path: path.join(workspaceRoot, ".env"), override: false },
    { path: path.join(workspaceRoot, ".env.local"), override: true },
    { path: path.join(packageRoot, ".env"), override: false },
    { path: path.join(packageRoot, ".env.local"), override: true },
  ];
  for (const file of files) {
    if (!existsSync(file.path)) continue;
    for (const line of readFileSync(file.path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (!file.override && process.env[key] !== undefined) continue;
      process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, "");
    }
  }
};

loadEnvFiles();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Set it in sayso-labs/.env or sayso-labs/.env.local.");
}

const migrationPath = path.resolve(findWorkspaceRoot(), "packages/db-postgres/migrations/001_init.sql");

const child = spawn("psql", [process.env.DATABASE_URL, "-f", migrationPath], {
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
