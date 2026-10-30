import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^wasp\/server$/,
        replacement: fileURLToPath(
          new URL("./tests/serverHarness.ts", import.meta.url),
        ),
      },
    ],
  },
  test: {
    include: ["tests/**/*.test.ts"],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 20000,
  },
});
