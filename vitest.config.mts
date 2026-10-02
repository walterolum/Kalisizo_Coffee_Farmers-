import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],

    /**
     * Generous per-test budget, and deliberately so.
     *
     * The suite is almost entirely pure and synchronous: mocked Prisma, no
     * network, no real timers. Measured unloaded, the whole run takes ~5s across
     * 391 tests, so an individual test needs to be several hundred times slower
     * than normal before it matters.
     *
     * On a loaded machine it can be. With a 5s default, a single 14-iteration
     * loop in `page-slug-rename` and the real disk I/O in `storage-backend` both
     * failed intermittently while the *same* code passed in isolation in under
     * 600ms. Those failures say nothing about the code under test, and a suite
     * that fails at random on a busy laptop or a shared CI runner trains people
     * to re-run until it goes green.
     *
     * This widens the budget; it removes no assertion. Both files have been
     * mutation-tested — breaking the reserved-slug suffixing, the storage
     * containment re-check, or idempotent delete each still fails them.
     */
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
