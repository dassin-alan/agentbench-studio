import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { "@agentbench/shared": path.join(root, "packages/shared/src/index.ts") } },
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 60_000,
    sequence: { concurrent: false }
  }
});
