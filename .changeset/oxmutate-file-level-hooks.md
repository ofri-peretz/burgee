---
"oxmutate": patch
---

Three fixes to the warm runner, each reproduced by a fixture, and one less waste. The first showed up as a
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

**A mutant is armed through the test's own `beforeEach`, as Stryker arms it.** The dry run credits code a
hook runs to the test, so a mutant in a fixture builder or a seed was planned for it, but the hooks ran
before the mutant was armed: it always survived the warm run and was killed later by an isolated run in a
fresh process. On a Mongo-backed suite that was 58 of 400 mutants; now the warm run kills them.

**A unit no longer runs a mutant another unit has already killed.** Units are filtered against the kills
known when a server takes them, not when they were built; most units wait in the queue while others run.
On burgee/paratext warm executions fell from 6,548 to 5,209 and the warm phase from 85 s to 77 s, with
every verdict unchanged (modelled in `.sdlc/intents/oxmutate/dispatch.qnt`).
