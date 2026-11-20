---
"oxmutate": patch
---

Faster runs on suites with a slow test, with the same verdicts. Flaky re-runs are now only for mutants a flaky test could have decided: a mutant killed by a steady test, in a file with no flaky test, is no longer re-run. On unjs/pathe 416 of 786 isolated runs were flaky re-runs. The dry run also gives each test 3x its `testTimeout` and `hookTimeout`, because counting coverage slows it: a test that passes in the project's own run no longer fails the dry run with "test(s) fail with no mutant active", or reads as flaky, from that slowdown alone. Mutant runs keep the project's own timeouts.
