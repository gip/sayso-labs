import { Command, Option } from "commander";
import type { XmtpEnv } from "../sayso/types.js";
import type { SharedCliOptions } from "../sayso/xmtp.js";

export type CommonOptions = SharedCliOptions & {
  env: XmtpEnv;
  dbDir: string;
};

export const addCommonOptions = (command: Command) =>
  command
    .option("--private-key <hex>", "XMTP wallet private key. Falls back to XMTP_PRIVATE_KEY.")
    .addOption(
      new Option("--env <env>", "XMTP network environment")
        .choices(["local", "dev", "production"])
        .default("dev"),
    )
    .option("--db-dir <path>", "XMTP local database directory", ".data/xmtp");

export const getCommonOptions = (command: Command): CommonOptions => {
  const options = command.opts<CommonOptions>();
  return {
    privateKey: options.privateKey,
    env: options.env ?? "dev",
    dbDir: options.dbDir ?? ".data/xmtp",
  };
};
