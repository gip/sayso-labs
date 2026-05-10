import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const findRepoRoot = () => {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../.."),
    path.resolve(process.cwd(), "../../.."),
  ];
  const root = candidates.find((candidate) => {
    if (existsSync(path.join(candidate, "skills/sayso-protocol/SKILL.md")) && existsSync(path.join(candidate, "skills/sayso-network"))) return true;
    return existsSync(path.join(candidate, "../skills/sayso-protocol/SKILL.md")) && existsSync(path.join(candidate, "SKILL.md"));
  });
  if (!root) throw new Error("Unable to locate SaySo repository root for skill markdown.");
  return existsSync(path.join(root, "skills/sayso-network")) ? root : path.resolve(root, "..");
};

export const readSkillMarkdown = (relativePath: string) =>
  readFileSync(path.join(findRepoRoot(), relativePath), "utf8");
