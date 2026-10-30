---
"oxmutate": minor
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

**Static mutants are decided in a live worker.** Each one used to get a fresh worker per test file that
loads its module, about 80 ms of start-up around tests that take milliseconds. Now a live worker arms
the mutant, resets the module registry (dependencies inlined) and collects the file again, so its tests
run against modules evaluated under the mutant. A file whose own collection changes globals,
`process.env` or a built-in prototype, a mutant that leaves such a trace, or an unarmed re-collection
that fails sends the batch back to the fresh-worker path; `OXMUTATE_ISOLATE_STATIC=1` keeps that path
for everything. burgee/paratext: 35 s to 17.5 s, 6.2x faster than Stryker 10, every verdict unchanged
(modelled in `.sdlc/intents/oxmutate/staticwarm.qnt`, locked by the `static-const` and `static-leak`
fixtures).

**A mutator Stryker does not have: `NumericLiteral`.** Numbers are mutated the way PIT's "inline
constant" does it: 0 becomes 1, 1 becomes 0, anything else n + 1, the off-by-one a test of a limit or
an index should notice. Object and destructuring keys, types and enum members are left alone. On
burgee/paratext that is 78 more mutants (1,446 against Stryker's 1,356), 19 of them survivors no
Stryker run reports; on controlroom 70 more, 17 survivors. `--stryker-compat` leaves numbers alone, so
it still produces Stryker's mutant set exactly.
