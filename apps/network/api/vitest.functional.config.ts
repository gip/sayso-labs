import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/functional/**/*.ts"],
    testTimeout: 240_000,
    hookTimeout: 30_000,
  },
});
