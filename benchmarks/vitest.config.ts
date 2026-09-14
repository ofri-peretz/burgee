import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".fixtures/**"],
    /*
     * Every test in this package spawns something and waits for it — a stub `claude` per
     * variant, a published tarball, a tool installed into a temp dir. `vitest-coverage.config.ts`
     * already says so out loud about this repo: "the signal tests spawn a child and kill it".
     *
     * Vitest's default is 5s, and `agent.test.ts` hands its own subject `timeoutMs: 30_000` —
     * so the code under test was permitted six times longer than the assertion waiting on it.
     * That is not a timeout, it is a bet on the machine: it holds on a quiet CI runner and
     * loses locally, where `origin/main` with no changes measures 11–25s across four of these
     * tests and flips between pass and fail run to run. A push touching `packages/burgee`
     * cannot clear the pre-push gate while that coin is being flipped.
     *
     * 60s is above the subject's own 30s ceiling, so a real hang still fails — it just fails
     * for being a hang rather than for the box being busy.
     */
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
