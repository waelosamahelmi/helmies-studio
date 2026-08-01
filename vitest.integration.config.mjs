import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.int.test.mjs"],
    setupFiles: ["tests/integration/setup.mjs"],
    fileParallelism: false, // suites share one database
    testTimeout: 30000,
  },
  resolve: { alias: { "@": path.resolve(root, "src") } },
});
