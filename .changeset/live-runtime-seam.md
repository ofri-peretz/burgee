---
'burgee': patch
---

Read the process through one live seam, and fix the cliui growth gate's instrument.

`src/runtime.ts` is now the only file in the package that names `process` (PLAN 4.3, Y9); the
allow-list in `process-reference-lock.test.ts` is down from nine burgee entries to one. Every
member of the new `host` export is a getter, because the commander and yargs front-ends
reproduce their incumbents' process contracts and those suites swap `process.argv`, `exit` and
`env` per test — a captured object literal would hand a test the value from before its own
swap. Graded before and after: commander 1360/1360, yargs 804/804, unchanged. Two reads that
had been captured at import are now live, `yargs-parser`'s default env among them.

`growth()` in `yargs/cliui.test.ts` was measuring the clock on one of its two assertions: at
n = 12,000 both the cost at n and the cost at 4n fell under the helper's 0.05 ms floor, so the
padding gate computed `0.05 / 0.05` and reported 1.0000 in 17 of 20 runs. It now calibrates a
batch until the window at n is a real measurement, and takes the minimum of each side across
samples rather than the minimum of the per-sample ratios — the second is what let a
GC-perturbed numerator produce the 10.145 that failed CI. The ceiling stays at 8.
