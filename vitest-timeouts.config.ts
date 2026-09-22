/**
 * One timeout policy for the package suites, and the measurement that set it.
 *
 * vitest's defaults — 5 s for a test, 10 s for a hook — are sized for a test body that
 * computes. Most of these suites do not: they write config files into temp directories and
 * search for them, spawn real child processes and signal them, hide a cursor and wait for the
 * restore. And they all run inside `turbo run typecheck test build`, which starts up to ten
 * package tasks at once, each forking its own worker pool. That is the environment they have
 * to pass in, and under it a 5 s budget is not a limit on the test — it is a limit on how busy
 * the machine is allowed to be while the test runs.
 *
 * ## The measurement, 2026-09-22
 *
 * The battery was run repeatedly on a 14-core machine, forced so nothing came from cache:
 *
 *   - `--concurrency=1`  — 2 of 2 clean
 *   - `--concurrency=2`  — 2 of 2 clean, 82 s
 *   - `--concurrency=3`  — 1 of 2 failed, 65 s
 *   - default (10)       — 2 of 4 failed, 45 s
 *
 * Every failure was `Error: Test timed out in 5000ms.` and every one of them was a suite that
 * touches the filesystem or spawns: `seniority`'s lilconfig and rc, `bellpull`'s escape and
 * matrix, `burgee`'s dev loop. They pass alone in milliseconds. `seniority`'s `rc()` — the call
 * inside three of the failing cases — was timed at **0.5 ms idle and 159 ms under load**, two
 * orders of magnitude short of the 5,420 ms the cases were killed at.
 *
 * So it is contention, and the question was only which axis to fix it on. Bounding turbo to
 * two tasks is clean and costs **+37 s on every push, forever**. Capping vitest's worker pool
 * was tried and measured and did **not** help — 2 of 4 either way — because the contention is
 * between tasks, not inside one. A timeout that matches what the suite actually does costs
 * nothing when it passes.
 *
 * 30 s, not 60: it has to be far enough above "the machine is busy" to stop being a coin toss
 * and far enough below "forever" that a genuine hang still fails a build rather than parking
 * it. A test that needs more than thirty seconds of wall clock is a test with a bug in it.
 */
export const timeouts = {
  testTimeout: 30_000,
  /** Setup and teardown spawn and remove whole directory trees; `bellpull` already used 60 s by hand. */
  hookTimeout: 60_000,
} as const;
