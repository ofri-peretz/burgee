# compat-oracle

Internal. Never published.

Grades burgee's compatibility against commander and yargs, and roundel's against chalk,
two ways:

1. **Their own test suites**, vendored and pointed at our implementation by a
   one-line shim. Proves we pass the tests they wrote. Each suite is also run against
   the real incumbent (`--control`), so the gate itself is proven before it grades
   anything; the current counts are in `baseline/` and on the compatibility page.

   | Host | Release | Runner | Target | Control | Ours |
   | :-- | :-- | :-- | :-- | --: | --: |
   | commander | 15.0.0 | node:test | `burgee/commander` | 1360 / 1360 | 1360 / 1360 |
   | yargs | 18.2.0 | mocha | `burgee/yargs` | 814 / 816 | 816 / 816 (2026-09-30) |
   | chalk | 6.0.1 | ava | `roundel/chalk` | 59 / 59 | 59 / 59 (2026-09-30) |

   `npm run compat -- chalk --control` grades one host; bare `npm run compat` grades all.
   `npm run compat -- --majors` grades each drop-in against its incumbent's **previous**
   major instead (C1: `PREVIOUS_MAJORS` in `src/hosts.ts` — commander 14, yargs 17), with
   baselines under `baseline/majors/`; add `--control` for the real older packages.

   **The number has to be the number a stranger gets.** Vendored suites run unedited, so
   whatever they `require` is a dependency of this package, pinned. cli-table3's suite
   requires `cli-table` — a *second* incumbent, and here purely as a test dependency of the
   first: `verify-legacy-compatibility-test.js` runs its assertions twice, against
   `require('cli-table')` and against our shim, to show the two agree. Without it installed
   the file fails to load and the control reads 15 / 16, not 29 / 29. The nine cases that
   grade `cli-table` itself are excluded from the gate by name in `src/hosts.ts`; the file
   still has to load, so the dependency stays. `src/vendored-suite.test.ts` fails when a
   vendored suite reaches for a package this `package.json` does not declare.
2. **Reference drivers** (`src/drivers/`) that run the *real* incumbents in-process,
   so the same user program can be run through commander and through
   `burgee/commander` and diffed byte for byte. That catches formatting drift a
   pass/fail suite tolerates — requirement X7.

The drivers were `commander-harness` and `yargs-harness`, standalone packages from
when the plan was a layer on top of both. They are measuring instruments, not
products, so they live inside the thing that measures with them.

See `.sdlc/intents/compat-oracle/`.

## Benchmarks

Every number here is produced by `npm run bench` and published at [burgee.interlace.tools/docs/benchmarks](https://burgee.interlace.tools/docs/benchmarks).

No suite is graded against this package yet, so there is no compatibility number to quote.
