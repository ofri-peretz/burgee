---
"oxmutate": patch
---

The dry run no longer writes new entries into the project's snapshot files. To find run-once test files, the dry run runs a suite's first passing test a second time. That second run's `toMatchSnapshot()` counted as the test's second snapshot, and outside CI Vitest wrote it to disk: one dry run of burgee added 90 lines to two committed `.snap` files. The probe now resets the per-try state first, as the mutant loop does before each run.
