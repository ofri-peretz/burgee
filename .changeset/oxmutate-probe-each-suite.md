---
"oxmutate": patch
---

A test file that opens with plain tests and holds a RuleTester block further down is now found run-once. The dry run probed only each file's first passing test, which passes when run again, so the block's tests still restarted the context for every mutant. It now probes the first passing test of each suite.
