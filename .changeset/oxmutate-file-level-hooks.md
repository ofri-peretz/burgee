---
"oxmutate": patch
---

Two fixes to the warm runner's canary, each reproduced by a fixture. The first showed up as a
pollution restart on nearly every mutant of a real suite; modelling the loop in Quint
(`.sdlc/intents/oxmutate/canary.qnt`) then found the second.

**File-level `beforeEach`/`afterEach` hooks now re-run between mutants.** Vitest 5 does not link a
top-level `describe` back to its file, so the hook walk stopped at the `describe` and skipped the hooks
at the top of the test file, where most suites reset their state. Every canary then ran on the previous
mutant's leftovers, failed, and was reported as pollution: the unit's remaining verdicts were thrown
away and re-run in a fresh context, one restart per mutant. On a Mongo-backed service suite each mutant
cost seconds instead of the test's ~140 ms, and the spec-oracle verdicts from those runs were discarded.

**No kill is decided on an earlier mutant's leftovers any more.** Once the canary interval had doubled,
a mutant could run on state the mutant before it left behind (a cleanup function mutated to do nothing).
When that run failed and the test's own `finally` cleaned up, the batch canary passed and the wrong kill
was reported. A kill that follows unchecked runs is now checked at once: the canary runs, and the mutant
is decided again from clean state. Survivors were already confirmed in isolation.
