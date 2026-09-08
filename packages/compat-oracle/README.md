# compat-oracle

Internal. Never published.

Grades burgee's compatibility against commander and yargs, two ways:

1. **Their own test suites**, vendored and pointed at our implementation by a
   one-line shim. Proves we pass the tests they wrote. Measured baseline:
   1,210 of 1,215 commander tests pass against real commander, so the gate itself
   is proven before it grades anything.
2. **Reference drivers** (`src/drivers/`) that run the *real* incumbents in-process,
   so the same user program can be run through commander and through
   `burgee/commander` and diffed byte for byte. That catches formatting drift a
   pass/fail suite tolerates — requirement X7.

The drivers were `commander-harness` and `yargs-harness`, standalone packages from
when the plan was a layer on top of both. They are measuring instruments, not
products, so they live inside the thing that measures with them.

See `.sdlc/intents/compat-oracle/`.
