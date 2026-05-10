import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const staleProgramPath = path.join(packageRoot, "dist/oracle/quickjsProgram.js");
const runtimeApps = [
  {
    sourcePath: path.join(packageRoot, "src/oracle/runtime-app.js"),
    targetPath: path.join(packageRoot, "dist/oracle/runtime-app.js"),
  },
  {
    sourcePath: path.join(packageRoot, "src/demo/runtime-app.js"),
    targetPath: path.join(packageRoot, "dist/demo/runtime-app.js"),
  },
];

const forbiddenPatterns = [
  { name: "static import", pattern: /^\s*import\s/m },
  { name: "dynamic import", pattern: /\bimport\s*\(/ },
  { name: "require", pattern: /\brequire\s*\(/ },
  { name: "fetch", pattern: /\bfetch\s*\(/ },
  { name: "WebSocket", pattern: /\bnew\s+WebSocket\b/ },
  { name: "XMLHttpRequest", pattern: /\bnew\s+XMLHttpRequest\b/ },
  { name: "EventSource", pattern: /\bnew\s+EventSource\b/ },
  { name: "importScripts", pattern: /\bimportScripts\s*\(/ },
  { name: "process", pattern: /\bprocess\s*\.\s*env|\bglobalThis\s*\.\s*process/ },
  { name: "Buffer", pattern: /\bBuffer\s*[.(]/ },
];

for (const { sourcePath, targetPath } of runtimeApps) {
  const source = readFileSync(sourcePath, "utf8");

  for (const { name, pattern } of forbiddenPatterns) {
    if (pattern.test(source)) {
      throw new Error(`${sourcePath} must be self-contained; found ${name}.`);
    }
  }

  mkdirSync(path.dirname(targetPath), { recursive: true });
  copyFileSync(sourcePath, targetPath);

  const targetSize = statSync(targetPath).size;
  if (targetSize !== Buffer.byteLength(source)) {
    throw new Error(`${sourcePath} copy verification failed.`);
  }
}

if (existsSync(staleProgramPath)) {
  unlinkSync(staleProgramPath);
}
