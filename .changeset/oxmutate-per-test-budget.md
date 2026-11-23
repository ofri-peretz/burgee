---
"oxmutate": minor
---

A warm run is held to the limit of the test it is running, not to the budget of the slowest test that
covers the mutant. The worker's progress mark now carries the running test's dry-run time, and the
watchdog budgets on it with the formula it always used (`timeoutMS` plus the larger of `timeoutFactor`
and 3 times the test's time, plus 250 ms, at most 5 s), and gives the in-place grace per test too. A
mutant that blocks a 1 ms test for ever is stopped at that test's limit (about 2.3 s with the grace in
the fixture) instead of that of a 1.5 s test that covers the same line (10 s). A stop is still re-run
isolated at 3x before it is a Timeout, so a limit that is too short for a loaded machine costs a
re-run, not a verdict. A limit a mutant earned in one test no longer shortens its limit in the next.
New stat: `warmStopsMs`, how long each warm stop had run.
