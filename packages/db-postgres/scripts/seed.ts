import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createPgPool } from "../src/client.js";
import { referenceSkillSeeds } from "../src/skills.js";

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
  const packageRoot = path.resolve(workspaceRoot, "packages/db");
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

const pool = createPgPool();

try {
  for (const seed of referenceSkillSeeds()) {
    await pool.query(
      `
        INSERT INTO skill_documents (
          id,
          name,
          skill_id,
          version,
          display_name,
          sha256,
          document,
          is_reference
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, true)
        ON CONFLICT (name, sha256) DO UPDATE SET
          skill_id = EXCLUDED.skill_id,
          version = EXCLUDED.version,
          display_name = EXCLUDED.display_name,
          document = EXCLUDED.document,
          is_reference = true,
          updated_at = now()
      `,
      [
        randomUUID(),
        seed.name,
        seed.skillId,
        seed.version,
        seed.displayName,
        seed.sha256,
        JSON.stringify(seed.document),
      ],
    );
  }
  console.log(`Seeded ${referenceSkillSeeds().length} reference skills.`);
} finally {
  await pool.end();
}
