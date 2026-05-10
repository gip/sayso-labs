import { copyFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourcePath = path.join(packageRoot, "src/pong/runtime-app.js");
const targetPath = path.join(packageRoot, "dist/pong/runtime-app.js");
const source = readFileSync(sourcePath, "utf8");

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

for (const { name, pattern } of forbiddenPatterns) {
  if (pattern.test(source)) {
    throw new Error(`runtime-app.js must be self-contained; found ${name}.`);
  }
}

mkdirSync(path.dirname(targetPath), { recursive: true });
copyFileSync(sourcePath, targetPath);

const targetSize = statSync(targetPath).size;
if (targetSize !== Buffer.byteLength(source)) {
  throw new Error("runtime-app.js copy verification failed.");
}
