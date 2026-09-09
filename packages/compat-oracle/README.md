# compat-oracle

Internal. Never published.

Grades burgee's compatibility against commander and yargs, and roundel's against chalk,
two ways:

1. **Their own test suites**, vendored and pointed at our implementation by a
   one-line shim. Proves we pass the tests they wrote. Measured baseline:
   1,210 of 1,215 commander tests pass against real commander, so the gate itself
   is proven before it grades anything.

   | Host | Release | Runner | Target | Control | Ours |
   | :-- | :-- | :-- | :-- | --: | --: |
   | commander | 15.0.0 | node:test | `burgee/commander` | 1361 / 1361 | 1361 / 1361 |
   | yargs | 18.1.0 | mocha | `burgee/yargs` | 802 / 804 | 804 / 804 |
   | chalk | 6.0.0 | ava | `roundel/chalk` | 58 / 58 | 58 / 58 (2026-09-08) |

   `npm run compat -- chalk --control` grades one host; bare `npm run compat` grades all.

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
