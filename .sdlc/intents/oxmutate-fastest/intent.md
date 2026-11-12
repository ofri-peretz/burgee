# Intent — `oxmutate-fastest`: the fastest mutation run a machine can give without being exhausted, on Vitest and Jest

**Status:** approved · **Opened:** 2026-11-11 · **Owner:** @ofri-peretz · **Parent:**
[`oxmutate`](../oxmutate/intent.md) (shipped,
[`D-20261106-oxmutate-ships-measurements-continue`](../../decisions/D-20261106-oxmutate-ships-measurements-continue.md))

---

## What is wanted

Three outcomes, in this order.

1. **oxmutate spends its time where a verdict needs it.** The static phase (module-level
   mutants, re-imported per mutant) and the isolated phase (a fresh process per mutant) take a
   fraction of what they take today, with the same verdicts.
2. **A run does not exhaust the machine it runs on.** oxmutate measures what its workers cost,
   holds itself under a load and a memory limit by default, and exposes those limits as
   configuration.
3. **Jest suites get the warm path.** A project on Jest runs with per-test coverage and warm
   workers, as a Vitest project does today, not through one process per mutant.

## Why now

The owner asked for it on 2026-11-11: "We want to make oxmutate the fastest possible", "be
responsible and have heuristics (and maybe also configuration options) about resource management
to avoid exhausting machines", and "we should be able to work with jest and vitest".

**Measured.** The full run of 2026-11-04/05: oxmutate 1.5.0, all 12 packages, `concurrency: 2`,
machine load 21 to 42. Read from the phase line each package prints
(`~/Library/Logs/burgee-mutation-weekly.log`):

| Phase | Seconds | Share |
| :-- | --: | --: |
| Static mutants, decided in live workers | 91,741 | 68% |
| Isolated runs | 25,535 | 19% |
| Warm runs | 17,864 | 13% |
| Parse and instrument (the oxc core) | 2 | 0% |

- **compat-oracle:** static is 50,743 s of 63,795 s (80%). 963 of its 1,662 survivors are in
  `src/hosts.ts`.
- **burgee:** static is 35,958 s of 55,322 s (65%).
- **caique:** the exception. Warm is 3,218 s and isolated 2,567 s of 6,046 s.

**Read from the code** (`main` at `1350444030`):

- **Static survivors pay for every file.** A static mutant runs in one test file first. If it
  survives, it runs again in every other test file that loads its module
  (`coordinator.ts`, `decideStaticLive`, the two `rounds`). Each run is a module-registry reset,
  a re-collection and that file's tests.
- **Resource control is one number.** `concurrency` defaults to cores − 1, at most 8
  (`config.ts:235`). The load average is read in one place, to stretch a confirmation budget
  (`runner.ts:166`). Nothing checks memory, lowers priority, or recycles a worker that grows.
  `maxTestRunnerReuse` is answered with "workers are replaced on pollution and runaways,
  automatically" (`config.ts:91`).
- **The warm runner is Vitest's.** `runner.ts` extends Vitest's runner class and `child.ts`
  calls `createVitest`. Any other framework goes through `testRunner: 'command'`: the whole
  command once per mutant, no coverage (`command-runner.ts`).

**Seen, not measured.** On 2026-11-03 a head-to-head run was stopped by hand with the load
average between 55 and 92 (`sc8/RUNS.md`, `sc8r2-co-b-S1`).

## Affected users and systems

- **`packages/oxmutate`:** `coordinator.ts`, `runner.ts`, `scheduler.ts`, `child.ts`,
  `config.ts`, the report's `stats`, and its docs app.
- **Users of oxmutate** on any machine they also work on, and on CI runners with a memory limit.
- **Projects on Jest**, which today have only the command runner.
- **This repository's mutation lanes:** the pre-push changed-lines lane and the full run
  (`scripts/mutation.ts`), whose wall time moves.
- **Published numbers:** the speed readings in `ENGINES.md`, oxmutate's README and
  `sc8-profile.md`.

## Constraints

- **Verdicts do not change for speed.** A faster path ships only when it agrees with the path
  it replaces, mutant by mutant, on the packages it was measured on. A known disagreement is a
  defect, not a trade.
- **A missed kill outranks speed** (`sc8-profile.md`). A heuristic that can hide a kill is off by
  default until measured, and audited on every run when on.
- **No new runtime dependency** outside this repository (PRINCIPLES rule 2;
  `scripts/package-shape-lock.test.ts`).
- **Measured or it is a slogan** (PRINCIPLES rule 4). Every speed claim names its run, machine,
  load and commit, as `sc8/RUNS.md` does.
- **No mutation run in GitHub Actions**
  ([`D-20261101-no-mutation-in-gha`](../../decisions/D-20261101-no-mutation-in-gha.md)), and the
  full run has no schedule
  ([`D-20261104-mutation-full-once-then-deltas`](../../decisions/D-20261104-mutation-full-once-then-deltas.md)).
  Measurements here are local, one at a time.
- **Stryker's config keys keep working.** New options are additions.
- **The runner seam must not slow Vitest.** Extracting an interface is not allowed to cost the
  Vitest path a measurable amount.

## Success criteria

Each is a command or a recorded reading. `F` is speed, `G` is the governor, `J` is Jest.

- `F0` — **the `hosts.ts` verdicts are explained.** A sample of its static mutants is scored on
  1.1.0, on 1.5.0 and on the fresh-worker path (`OXMUTATE_ISOLATE_STATIC=1`), and every
  disagreement has a named cause in `sc8-profile.md`. Nothing below starts before this.
- `F1` — **the phases are accounted for.** `oxmutate run --json` reports, per phase, what it
  ran: imports, tests per static mutant per round, isolated runs by cause, files written. The
  parts add up to at least 95% of the wall time.
- `F2` — **static phase at least 5x shorter** on compat-oracle and burgee, against 1.5.0 on the
  same commit and machine, with identical verdicts.
- `F3` — **isolated phase at least 2x shorter** on caique, same terms.
- `F4` — **a full run of this repository at least 3x shorter** than the 2026-11-04/05 reading,
  at the same `concurrency`, with the load recorded beside it.
- `F5` — **the incremental cache reports its reuse.** A one-file change reports the share of
  verdicts reused and the share audited.
- `F6` — **a warm server spends its time in tests.** On burgee's paratext, the warm servers' time
  (`stats.warmUnitMs`) is at most 3 times the time inside test runs (`stats.warmArmedMs`). First
  reading, 2026-11-12: 11.5 s against 1.7 s, 6.8 times.
- `G1` — **a run holds itself under its limits.** Under a synthetic load above `maxLoad`, no new
  unit is dispatched, and dispatch resumes below it. A test shows both.
- `G2` — **the limits do not change a verdict.** The same fixture run with the governor on and
  off gives identical reports.
- `G3` — **memory is bounded, in total and per worker.** Workers times the measured worker size
  stays under `maxMemory`, and a worker past `workerMemoryLimit` is replaced between units.
- `G4` — **every limit is configuration**, in the shapes Vitest and Jest users already write
  (`maxWorkers` as a number or a percentage, memory as bytes, a size or a percentage), each with
  a flag, documented, with `--explain` naming where its value came from.
- `J1` — **the Vitest path runs behind the runner interface** with oxmutate's own suite
  unchanged and green, and warm time on caique within 3% of before.
- `J2` — **Jest agrees with Stryker's jest-runner** on at least 99% of verdicts on a Jest
  fixture, each disagreement explained.
- `J3` — **Jest is faster than Stryker's jest-runner** on that fixture, cold, median of five.

## Open questions

None open. The four choices a design needed were made as defaults, each reversible
([`D-20261111-oxmutate-fastest-defaults`](../../decisions/D-20261111-oxmutate-fastest-defaults.md)):
grouping off by default, a polite governor, measured worker memory, and Jest 29 and 30 on
jest-circus.

What is not known yet is measured, not decided: why `hosts.ts` went from Killed on 1.1.0 to
Survived on 1.5.0. Either the old kills were false (the on-disk pollution fixed in #1453) or the
live static path misses real kills. That is `F0`, and it comes first.
