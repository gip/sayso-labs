import { existsSync, writeFileSync } from "node:fs";
import type { SaySoLocalPaths } from "@sayso-labs/local-core";

export type LocalStoreHealth = {
  status: "ok";
  database: "ok";
  sqlitePath: string;
  xmtpPath: string;
};

export class SaySoSqliteLocalStore {
  constructor(private readonly paths: SaySoLocalPaths) {}

  initialize() {
    if (!existsSync(this.paths.sqlite)) {
      writeFileSync(this.paths.sqlite, "");
    }
  }

  health(): LocalStoreHealth {
    this.initialize();
    return {
      status: "ok",
      database: "ok",
      sqlitePath: this.paths.sqlite,
      xmtpPath: this.paths.xmtp,
    };
  }
}
