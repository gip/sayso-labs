import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { shouldServeRootMarkdown } from "./src/rootNegotiation.js";

const markdownContentType = "text/markdown; charset=utf-8";
const overviewMarkdownPath = path.resolve(import.meta.dirname, "src/sayso-overview.md");
const overviewPlaceholder = "__SAYSO_OVERVIEW_MARKDOWN__";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const findRepoRoot = () => {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../.."),
    path.resolve(process.cwd(), "../../.."),
  ];
  const root = candidates.find((candidate) => existsSync(path.join(candidate, "skills/sayso-protocol/SKILL.md")) && existsSync(path.join(candidate, "skills/sayso-network")));
  if (!root) throw new Error("Unable to locate SaySo repository root for skill markdown.");
  return root;
};

const listSaySoSkillMarkdown = () => {
  const repoRoot = findRepoRoot();
  const skills = readdirSync(path.join(repoRoot, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("sayso-") && existsSync(path.join(repoRoot, "skills", entry.name, "SKILL.md")))
    .map((entry) => ({
      fileName: `${entry.name}/SKILL.md`,
      pathName: `/${entry.name}/SKILL.md`,
      sourcePath: path.join(repoRoot, "skills", entry.name, "SKILL.md"),
    }));
  return skills.sort((left, right) => left.fileName.localeCompare(right.fileName));
};

const saysoSkillMarkdownPlugin = (): Plugin => ({
  name: "sayso-skill-markdown",
  transformIndexHtml(html) {
    return html.replace(overviewPlaceholder, escapeHtml(readFileSync(overviewMarkdownPath, "utf8")));
  },
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const pathname = request.url ? new URL(request.url, "http://localhost").pathname : "";
      if ((request.method === "GET" || request.method === "HEAD") && pathname === "/" && shouldServeRootMarkdown(request.headers.accept)) {
        server.watcher.add(overviewMarkdownPath);
        response.statusCode = 200;
        response.setHeader("Content-Type", markdownContentType);
        response.end(request.method === "HEAD" ? undefined : readFileSync(overviewMarkdownPath, "utf8"));
        return;
      }

      if (!/^\/sayso-[^/]+\/SKILL\.md$/.test(pathname)) {
        next();
        return;
      }

      const skill = listSaySoSkillMarkdown().find((candidate) => candidate.pathName === pathname);
      if (!skill) {
        next();
        return;
      }

      server.watcher.add(skill.sourcePath);
      response.statusCode = 200;
      response.setHeader("Content-Type", markdownContentType);
      response.end(readFileSync(skill.sourcePath, "utf8"));
    });
  },
  generateBundle() {
    for (const skill of listSaySoSkillMarkdown()) {
      this.emitFile({
        type: "asset",
        fileName: skill.fileName,
        source: readFileSync(skill.sourcePath, "utf8"),
      });
    }
    this.emitFile({
      type: "asset",
      fileName: "sayso.md",
      source: readFileSync(overviewMarkdownPath, "utf8"),
    });
  },
});

export default defineConfig({
  plugins: [saysoSkillMarkdownPlugin(), react()],
  optimizeDeps: {
    exclude: ["@xmtp/wasm-bindings", "@xmtp/browser-sdk"],
    include: ["@xmtp/proto"],
  },
  server: {
    allowedHosts: ["azog7j88r6wi.share.zrok.io"],
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
