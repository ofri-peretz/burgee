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
   | chalk | 6.0.0 | ava | `roundel/chalk` | 58 / 58 | 47 / 58 (2026-09-08) |

   chalk's 11 failures are all of `force-color.js`: a *piped* fixture expected to colour
   under `FORCE_COLOR`, `--color=…` and Azure's `TF_BUILD`. roundel's policy (R2) reads
   `FORCE_COLOR` on a terminal and never colours a pipe, so those stay red by design; the
   other five files (chaining, instances, `level`, `visible`, forcing by level) are 47 / 47.
   `npm run compat -- chalk --control` grades one host; bare `npm run compat` grades all.
2. **Reference drivers** (`src/drivers/`) that run the *real* incumbents in-process,
   so the same user program can be run through commander and through
   `burgee/commander` and diffed byte for byte. That catches formatting drift a
   pass/fail suite tolerates — requirement X7.

The drivers were `commander-harness` and `yargs-harness`, standalone packages from
when the plan was a layer on top of both. They are measuring instruments, not
products, so they live inside the thing that measures with them.

See `.sdlc/intents/compat-oracle/`.
