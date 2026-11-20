# Spec — `oxmutate-x2`, workstream 1: survivor confirmation in a live worker

**Intent:** [`intent.md`](./intent.md) · **Model:** [`../oxmutate/confirm.qnt`](../oxmutate/confirm.qnt)
(`LIVE`), on [`../oxmutate/staticwarm.qnt`](../oxmutate/staticwarm.qnt)'s guards

## What changes

Section 6b of `packages/oxmutate/src/coordinator.ts` confirms every warm survivor with two or more
covering tests. In 2.9.0 each confirmation is `runIsolated`: a fresh Vitest worker per (mutant,
file), 80–110 ms each, 100 of ufo's 11.3 s of isolated time (none overturned).

Now 6b first sends the survivors to `decideLive(survivors, filesFor, confirm = true)`, the static
path's live-worker machinery (5b):

1. One `static` unit per (covering file, batch of up to 25 survivors), on the warm pool, which
   inlines dependencies. The unit carries `staticTests`: each mutant's covering tests in that file
   (`OXMUTATE_STATIC_TESTS`).
2. In the worker, per mutant: arm it, `vi.resetModules()`, `collectTests([file])`, then run the
   file with every runnable test's hooks and only the covering tests' bodies, stopping at the first
   failure (`runCollected(file, runnable, bodies)`).
3. The guards are 5b's: the file's own collection and each mutant must leave `globalThis`,
   `process.env` and the built-in prototypes as they were; an unarmed re-collection after the first
   mutant, then every 2, then every 4, must pass, and verdicts are held until it does; a deadlock
   tears the worker down. Anything they catch goes back with the rest of the batch.
4. Two rounds, as 5b: the cheapest covering file first, the rest only for a mutant still alive. That
   is what `runIsolated` does (files cheapest first, stopping at the first that kills).
5. Never grouped (`staticGroups` is not sent for a confirmation): a group can hide a kill
   (`group.qnt`).

What comes back goes to `runIsolated` exactly as before, and so does every record the fresh path
would have to read twice: a timeout (hit limit or deadlock) and a kill only by a test's or hook's
own timeout (`slow`). The `RERUN_SLACK` recheck, `statusReason` and `survivorsOverturned` are
unchanged, and a static unit's `static.budgetMs` does not apply to confirmations.

`OXMUTATE_ISOLATE_CONFIRM=1` sends every confirmation to `runIsolated`, as 2.9.0 did.

## Why the verdicts are the same

The reference is the fresh run: the mutant armed from process start, Vitest running each covering
file with `OXMUTATE_ONLY_TESTS` = the covering tests.

- **Armed from collection.** A confirmed mutant is never static (static mutants are not in `toRun`),
  so no switch is taken while the file is imported: armed at process start and armed at collection
  give the same modules. The modules are evaluated afresh under the mutant either way (registry
  reset with dependencies inlined, or a new worker).
- **The same tests.** Vitest calls every test's hooks and the runner's `runTask` skips the body of a
  test outside `OXMUTATE_ONLY_TESTS`; the live run calls every runnable test's hooks and runs only
  the bodies in `staticTests`. `runnable` is Vitest's own collection of the file (its `.only`,
  `.skip` and name filters). Fixture `cross-test`'s `runs only unarmed` test fails whenever its body
  runs armed: with the filter removed, two `touch()` survivors are reported Killed (checked
  2026-11-19, the e2e case fails).
- **The same reading.** A failed test, a hook that throws, or an unhandled error is a kill in both.
  A timeout or a kill only by a test's own timeout is not read live at all: it goes to the fresh run.
- **What Vitest does that `runCollected` does not** (retry, repeats, `fails`, concurrent tests,
  around-hooks, `onTestFinished`/`onTestFailed`, `context.skip()`) sends the file back
  (`src/collected.ts`, checked before the first mutant and after every run). This also applies to
  static mutants, which had the same gap.
- **Leaks between confirmations in one worker** are staticwarm.qnt's question, with its answer: safe
  under its guards except an in-place change to an existing object that the unmutated tests do not
  see. `confirm.qnt` takes that as `GUARDED`, and the residual is checked the same way: `bench/ab.mjs`
  and the corpus digests equal.

Residual, beyond staticwarm.qnt's: a test fixture (`test.extend`) whose teardown matters is not torn
down between re-collections in the live worker. A teardown that leaves the next collection broken
fails the unarmed re-collection and falls back; one that changes only an armed verdict is not
caught. None of the bench targets or fixtures uses `test.extend`.

## Rejected

- **Grouping confirmations** (`static.group`'s groups, armed together): fewer re-collections, but two
  mutants can hide each other's kill (`group.qnt`), and a survivor is what a person acts on.
  Single-mutant evaluations only.
- **Every runnable test's body, as the static path runs them**: one line less, and wrong. A test
  that does not cover the mutant can fail with it armed after the covering tests ran
  (`confirmLiveAllBodies` violates `safety`; fixture `cross-test` shows it).
- **Confirming inside the warm unit** (arming across the file's covering tests in the warm worker):
  the warm worker evaluated its modules unarmed, so state a module builds at import is the
  unmutated one; a re-collection under the mutant is what makes the run the fresh worker's.
- **Reading timeouts and slow kills live**: the fresh path re-runs them at `RERUN_SLACK`; deciding
  them live would change which runs get that second look. They go back instead.

## Checks

- `confirm.qnt`: `confirmLive` holds `safety`; `confirmLiveAllBodies` (no test filter) and
  `confirmLiveUnguarded` (no guards) violate it (`models.yml`).
- `e2e.test.ts` › survivor confirmation in a live worker: the cross-test mutant is Killed with the
  cross-test reason and `survivorsOverturned` 1, every confirmation live; the same verdicts as
  `OXMUTATE_ISOLATE_CONFIRM=1`. With confirmation skipped (`survivors = []`) the first case fails on
  `20:BlockStatement:Survived`.
- `collected.test.ts`: each feature `runCollected` does not model is refused.
- `bench/ab.mjs` against 2.9.0, and `bench/container.mjs --compare` against a baseline re-run.
