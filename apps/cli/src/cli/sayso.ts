#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { fetchLocalBackendHealth, startLocalBackend, stopLocalBackend } from "./localBackend.js";
import { registerIdentityCommands } from "./identityCommands.js";

const program = new Command();

program
  .name("sayso")
  .description("SaySo CLI frontend.")
  .showHelpAfterError();

const backend = program.command("backend").description("Manage the per-user SaySo personal service.");

backend.command("status").description("Show personal service health.").action(async () => {
  console.dir(await fetchLocalBackendHealth(), { depth: null });
});

backend.command("start").description("Start personal service if needed.").action(async () => {
  console.dir(await startLocalBackend(), { depth: null });
});

backend.command("stop").description("Stop the personal service.").action(async () => {
  console.dir(await stopLocalBackend(), { depth: null });
});

registerIdentityCommands(program);

await program.parseAsync();
