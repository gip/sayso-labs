import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const findRepoRoot = () => {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../.."),
    path.resolve(process.cwd(), "../../.."),
  ];
  const root = candidates.find((candidate) => existsSync(path.join(candidate, "skills/sayso-protocol/SKILL.md")) && existsSync(path.join(candidate, "examples")));
  if (!root) throw new Error("Unable to locate SaySo Labs repository root for skill markdown.");
  return root;
};

export const readSkillMarkdown = (relativePath: string) =>
  readFileSync(path.join(findRepoRoot(), relativePath), "utf8");
