# Design — `oxmutate-fastest`

Intent: [`intent.md`](./intent.md). **Status:** accepted 2026-11-11
([`D-20261111-oxmutate-fastest-accepted`](../../decisions/D-20261111-oxmutate-fastest-accepted.md)).

---

## Requirements

**Speed**

- `R1` — The `hosts.ts` verdict change between 1.1.0 and 1.5.0 has a recorded cause before any
  static-phase code changes (`F0`).
- `R2` — `stats` reports per phase: module re-collections, tests run per static mutant per
  round, isolated runs by cause (static fallback, runaway, crash, pollution, survivor
  confirmation, flaky), and files written. The summary line prints them (`F1`).
- `R3` — **Grouped static survivors.** In a test file that is not a static mutant's first file,
  up to `static.group` mutants are armed in one re-collection. A passing run scores every mutant
  in the group Survived in that file. A failing run is bisected until each failing mutant is
  found alone (`F2`).
- `R4` — A group holds only mutants from different top-level statements of their module, and
  never two mutants whose spans overlap.
- `R5` — With grouping on, 5% of group-survived (mutant, file) pairs are re-run alone on every
  run. A pair that fails alone fails the run with exit 1, names both, and turns grouping off for
  that module in the incremental file.
- `R6` — `static.group` defaults to `1` (off) until `F2` holds on three packages with identical
  verdicts. Raising the default is a decision in `.sdlc/decisions/`.
- `R7` — The per-mutant progress mark is written without creating or reopening a file per
  write.
- `R8` — Survivor confirmations run batched per test file in a worker that resets its module
  registry, under the same three guards the static path uses, when `R2` shows confirmations are
  at least 30% of isolated runs on caique. If they are not, `R8` is dropped with the reading.
- `R9` — `--incremental` prints verdicts reused, re-run and audited, as counts and shares
  (`F5`).
- `R10` — `static.budgetMs`: an opt-in cap on what one static mutant may spend across its files.
  A mutant that reaches it is reported `Timeout` with the reason "static budget", counted
  separately in `stats`. Off by default.

- `R10a` — **Warm overhead.** A warm unit's cost outside its test runs is measured
  (`stats.warmUnitMs` against `stats.warmArmedMs`) and reduced until `F6` holds: fewer units for
  the same pairs, fewer restarts that a clean canary would not have asked for, and no file opened
  per write on a path that runs once per mutant.

**Resources**

- `R11` — `resources.maxWorkers`: a number, a percentage of the cores (`'50%'`), or `'auto'`
  (default). The same shapes as Vitest's and Jest's `maxWorkers`. `'auto'` is cores − 1, at most
  8, and never more than `R13` allows. Stryker's top-level `concurrency` keeps working and means
  the same as a number here.
- `R12` — `resources.maxLoad` (default 1.5 × cores): above it, the pool dispatches no new unit;
  below it, dispatch resumes. One worker always runs.
- `R13` — `resources.maxMemory`: the memory all workers together may use, as bytes, a size
  (`'4GB'`) or a share of RAM (`'50%'`, the default). Workers × the worker size measured in the
  dry run stays under it, so it lowers the worker count before a machine swaps.
- `R14` — `resources.workerMemoryLimit`: one worker's limit, in the same three shapes (default
  2 × the dry-run size). A worker past it is replaced after its current unit, as Jest's
  `workerIdleMemoryLimit` does. Jest has no total limit, which is how its runs reach
  out-of-memory with every worker under its own; `R13` is that total.
- `R14a` — `resources.maxOldSpaceSize` (MB, default unset): passed to every worker as Node's
  `--max-old-space-size`, so a mutant that allocates without end stops in its own process. A
  worker that dies this way is replaced, and its mutant is reported with the reason "out of
  memory", not silently re-run.
- `R15` — `resources.priority`: `'low'` (default) or `'normal'`. `'low'` starts each server at
  a lowered OS priority.
- `R16` — The governor acts only between units. It never stops, re-orders or re-runs a unit that
  has started (`G2`).
- `R17` — Where the load average is unavailable (Windows reports 0), the governor uses CPU time
  sampled from `os.cpus()`.
- `R18` — `stats` reports the governor: seconds held back by load, by memory, workers replaced
  for memory, out-of-memory stops, and the peak worker size.
- `R19` — Each `resources` key is in the config schema, the docs, and `--explain`, and has a
  flag on `run`: `--max-workers`, `--max-memory`, `--worker-memory-limit`, `--max-load`.
- `R19a` — The test framework's own pool is pinned to one worker per oxmutate server (Vitest's
  `maxWorkers: 1`, Jest's `--runInBand`), so no limit above is multiplied by a second pool.

**Runners**

- `R20` — One runner interface: `dryRun` (tests, per-test coverage, static hits, module graph),
  `runUnit` (a plan of mutant-test pairs in a warm worker), `runIsolated`, `close`. The
  coordinator and scheduler call only it.
- `R21` — The Vitest runner implements `R20` with no change to its verdicts or its e2e tests.
- `R22` — `testRunner: 'jest'`: a Jest runner implementing `R20`, on Jest 29 and 30 with
  jest-circus. Jest is resolved from the project, as Vitest is.
- `R23` — The Jest runner arms a mutant per test through a test environment, records per-test
  coverage from circus events, and resets Jest's module registry for static mutants.
- `R24` — A project whose `package.json` or config names Jest and not Vitest gets
  `testRunner: 'jest'` without setting it.
- `R25` — The command runner stays, unchanged, for everything else.

## Design

### Why these, in this order

The intent's table decides it. Static is 68% of the time, isolated 19%, warm 13%, the oxc core
0%. So the order is: check the static path is right (`M0`), make it cheap (`M1`), make the run
polite (`M2`), cut the isolated phase (`M3`), then open the runner seam and add Jest (`M4`,
`M5`). The governor comes before the isolated work because every measurement after it is taken
on a machine it protects.

### `M0` — Correctness first, then a profile

- **`R1`.** Take 30 `hosts.ts` static mutants at the 2026-11-05 commit (`c1e0ba5f54`): 15 that
  were Killed on 1.1.0 and Survived on 1.5.0, and 15 that kept their verdict. Score each three
  ways: the published 1.1.0, the published 1.5.0, and 1.5.0 with `OXMUTATE_ISOLATE_STATIC=1`.
  For each 1.1.0 kill, read `killedBy` and run that test by hand against the mutated source.
- **Outcomes.** If the kills do not reproduce by hand, they were false and 1.5.0 is right: record
  it, and compat-oracle's floor is restated by decision. If they do reproduce, the live static
  path has a defect: it is fixed, with a fixture that fails without the fix, before `M1`.
- **`R2`.** New counters in `Stats`, incremented where the work happens (`afterStatic`,
  `afterUnit`, the isolated queue's builders). The e2e test that already checks "phases account
  for 95% of the run" gains the new parts.

### `M1` — Grouped static survivors

Today, round 2 of `decideStaticLive` runs each surviving mutant alone in every other loading
file. Most of those runs pass: the file loads the module and does not test that value.

- **The change (`R3`).** In round 2, `decideStatic` (runner) takes the unit's `staticIds` in
  groups. `evaluate` already takes the armed mutant; it takes a set. The runtime header's
  active-mutant check becomes a set lookup when a group is armed, and stays a single comparison
  otherwise.
- **A passing group** emits one `isolated` record per member, `killed: false`, with `group: n`.
- **A failing group** is split in half and each half re-run, down to single mutants. A single
  failing mutant is a kill, with its own `killedBy`.
- **Round 1 is unchanged.** A mutant's first file is the one most likely to kill it, and a kill
  there needs no group.
- **The existing guards stay per run:** the snapshot diff after each run, and the unarmed
  re-collection on its doubling schedule. A group counts as one run for that schedule.
- **Masking (`R4`, `R5`).** Two armed mutants can cancel: one breaks a value, the other breaks
  the check that would have noticed. `R4` keeps a group to mutants in different top-level
  statements, where the common case is independent data. `R5` audits. Neither proves absence,
  which is why `R6` keeps the default off until measured.
- **Model.** `group.qnt` beside this file: a group passes, fails, or is bisected; `val safety` is
  "no mutant is reported Survived in a file where it fails alone, unless the audit has not yet
  drawn it". The masking case is pinned as an expected violation with grouping on and no audit,
  as `stall.qnt` pins its own.
- **`R7`.** The runner opens the progress file once and writes each mark with `writeSync` at
  position 0 on the open descriptor. The scheduler's reader is unchanged.
- **`R10`.** A per-mutant running total in the coordinator; `keepUndecided` drops a mutant past
  its budget.

### `M2` — The governor

One module, `governor.ts`, asked by the pool before each dispatch: `mayDispatch(): boolean`, and
after each unit: `shouldReplace(server): boolean`.

- **Inputs, sampled every 2 s:** the 1-minute load average (or CPU-time delta, `R17`), total RAM,
  and each server's resident size, which the server already can send with its CPU samples
  (`process.memoryUsage().rss`, beside the `process.cpuUsage()` it sends every 250 ms).
- **Worker size** is the largest resident size seen in the dry run, per server.
- **`'auto'` workers** = min(cores − 1, 8, floor(`maxMemory` ÷ worker size)), at least 1. Recomputed when the worker size grows by more than 25%.
- **Load hold (`R12`).** Above `maxLoad`, `mayDispatch` is false while more than one server is
  busy. It uses the load oxmutate does not account for: the reading minus its own busy servers.
  Without that, a run at `concurrency: 8` on 8 cores would hold itself back.
- **Hysteresis.** Resume at 0.8 × `maxLoad`, so the pool does not flap.
- **Priority (`R15`).** `os.setPriority(child.pid, 10)` after each server starts. A failure to
  set it is a warning, once.
- **What it never does (`R16`):** stop a running unit, change a budget, or change the order of
  units. Budgets already stretch with load where they need to (`runner.ts`, `confirmFor`).
- **Sizes** are parsed once in `config.ts`: a number is bytes, a string takes `KB`, `MB`, `GB`
  or `%` of total RAM. An unreadable size is a config error (exit 3), not a default.
- **Config.** `resources` in `config.ts`, added to `USED` and the schema. `concurrency: n` at
  the top level maps to `resources.maxWorkers: n`.

### `M3` — The isolated phase

Decided by `M0`'s profile, not before it.

- **If survivor confirmation dominates (`R8`):** confirmations for one test file run in one
  fresh worker, mutant after mutant, with `vi.resetModules()` between them and the static path's
  guards: the snapshot diff, the unarmed re-collection, and a fallback to a process per mutant
  when a guard fires. The code is `decideStatic`'s loop with covering tests instead of all tests.
- **If runaways dominate (caique):** the remaining stops are busy stops (idle ones are already a
  Timeout at their budget). The lever is the spare server, so a stop costs no start-up on the
  critical path; `stats.serversSpawned` against stops shows whether it already does.
- **`R9`** is a reporting change in the incremental reader.

### Warm overhead, alongside `M3` (`R10a`)

Read on paratext on 2026-11-12 (1,415 mutants, about 5,000 test runs, `concurrency: 2`):

- **File writes per mutant run** were most of the warm phase on a machine with an endpoint
  scanner: 24.8–25.8 s before, 9.3–9.9 s after the runner kept its two files open (#1532).
- **After that, the servers ran 11.5 s for 1.7 s of test runs.** A CPU profile of the same run
  (152 processes, 53 s busy) put about 20 s in starting Node and loading modules, and 2.6 s in the
  package's own code and tests.
- **72 units for 12 test files.** 18 pollution restarts each split a unit in two. Every unit is a
  new worker: Vitest runs each `start` of a file in a fresh one when `isolate` is on.

So the order is: find out which of the 18 restarts a correct canary needs, then make a unit
larger where a file's mutants allow it. Neither changes which tests run for a mutant.

### `M4` — The runner seam

- `src/runner-api.ts` declares `R20`'s interface and the record types both runners emit
  (`ChildRecord` already is that type).
- `child.ts` and `runner.ts` move under `src/runners/vitest/` unchanged in behaviour. The
  coordinator takes a runner from `config.testRunner`.
- **The check is that nothing else changes:** oxmutate's own suite and the Stryker compat grade
  pass untouched, and caique's warm time is within 3% (`J1`).

### `M5` — Jest

- **Server.** A long-lived process that calls `@jest/core`'s `runCLI` per unit with
  `--runTestsByPath`, `--runInBand`, `--bail`, and the project's own config, with two overrides:
  the test environment and a transformer.
- **Arming and coverage.** A test environment that wraps the project's own environment. Its
  `handleTestEvent` sees `test_start` and `test_done` from jest-circus: it sets the active
  mutant before a test and records which mutants the test reached, as Stryker's jest-runner
  does.
- **Instrumented sources.** A Jest transformer that serves oxmutate's instrumented code for the
  mutated files and delegates every other file to the project's transformer.
- **Static mutants.** `jest.resetModules()` plays the part `vi.resetModules()` plays, per test
  file, under the same guards. Where a guard fires, a fresh Jest process decides.
- **Detection (`R24`).** `jest` in `devDependencies` or a `jest.config.*`, and no `vitest`.
- **What does not carry over at first:** the grouped static path (`M1`) is enabled for Jest only
  after `J2` holds without it.

### Files

| Milestone | Files |
| :-- | :-- |
| `M0` | `coordinator.ts` (stats), `reports.ts`, `e2e.test.ts`, `sc8-profile.md` |
| `M1` | `runner.ts` (`decideStatic`), `coordinator.ts` (`decideStaticLive`), `native/src/instrument.rs` (set lookup), `config.ts`, `group.qnt`, fixtures `static-group`, `static-mask` |
| `M2` | new `governor.ts`, `scheduler.ts` (two calls), `child.ts` (rss in the sample), `config.ts`, docs |
| `M3` | `coordinator.ts` (isolated queue), `runner.ts` |
| `M4` | new `runner-api.ts`, `runners/vitest/*` (moved), `coordinator.ts`, `scheduler.ts` |
| `M5` | new `runners/jest/*`, `config.ts`, fixture `jest-basic`, `bench/` |

`M1`, `M3` and `M4` all edit `runner.ts` and `coordinator.ts`. They run one after another, never
in parallel sessions.

## Verification

One gate per milestone. Each is a command that exits non-zero when the milestone is not met, and
nothing advances on a red gate. The bench scripts and test names below do not exist yet: each
milestone writes its gate first.

| Milestone | Gate |
| :-- | :-- |
| `M0` | `node packages/oxmutate/bench/verdict-diff.mjs` over the three `hosts.ts` reports exits 0 with every disagreement named; `e2e.test.ts` "phases account for the run" passes with the new counters |
| `M1` | `npx vitest run packages/oxmutate/src/e2e.test.ts -t "grouped static"`: verdicts on `static-group` equal the ungrouped run's, and `static-mask` (two mutants that cancel) is caught by the audit. Then `bench/static-ab.mts --package compat-oracle`: identical verdicts and a static phase at least 5x shorter |
| `M2` | `npx vitest run packages/oxmutate/src/governor.test.ts`: dispatch holds above `maxLoad` and resumes below; a worker past its memory limit is replaced; reports with the governor on and off are equal |
| `M3` | `bench/static-ab.mts --package caique --phase isolated`: identical verdicts, isolated phase at least 2x shorter, or `R8` dropped with the reading recorded |
| `M4` | `npm test -w oxmutate` and `npm run compat:mutation` pass with no test file changed; caique warm time within 3% |
| `M5` | `npx tsx packages/oxmutate/bench/burgee-pair.mts --fixture jest`: at least 99% agreement with Stryker's jest-runner and a shorter median of five |

**Each fix has a check that fails without it** (working agreement, rule 4). The fixtures named
above are written to fail on `main` first.

**Models.** `group.qnt` (`M1`) and `governor.qnt` (`M2`: "a unit that has started is never
stopped by the governor", "at least one worker is always allowed") are added to `models.yml`,
each with its mutation check.

**Measurement rules.** As `sc8/RUNS.md`: one package at a time, the load sampled every minute, a
comparison counted only when the two mean loads are within 1.5x. All local.

## Rejected alternatives

- **A faster parser or more Rust.** Instrumenting all twelve packages took 2 s of 135,000. The
  time is in tests running (`ENGINES.md`).
- **Skipping static mutants by default (`ignoreStatic`).** It is Stryker's answer and would
  remove 68% of the time at once. It also removes the verdicts, and grading static mutants is a
  stated difference from Stryker (`roadmap.md`). Kept as the existing option, with `R10` as a
  softer cap.
- **Sampling mutants.** Faster, and no longer a score that compares with last week's.
- **Grouping in round 1, or in the warm phase.** Round 1 is where kills are; a group that fails
  costs a bisection. Warm runs are already pruned to covering tests, one cheap run each.
- **Choosing a static mutant's tests by which bindings they read.** It would be exact where
  grouping is a heuristic, and it needs cross-module binding analysis in `oxc_semantic` plus a
  per-function entry counter. `hosts.ts` is one exported array, so every reader would be
  selected anyway. Not before a profile shows packages where it would help.
- **Raising `concurrency` to use the whole machine.** The 2026-11-03 run at load 55 to 92 is
  what that looks like. More workers than free cores makes every budget stretch and timeouts
  false.
- **A governor that pauses or kills running units.** A paused unit's watchdog budget keeps
  running; stopping one changes a verdict. Holding dispatch cannot.
- **`os.freemem()` as the memory signal.** On macOS it counts only free pages, not reclaimable
  ones, and reads near zero on a healthy machine. Measured worker size against total RAM does
  not have that problem.
- **Jest through its `--testNamePattern` filter per mutant.** That is the name filter whose
  Vitest twin produced false survivors (`SC7`). Arming through the environment needs no filter.
- **Jest before the speed work.** The seam touches the files `M1` and `M3` rewrite, and Jest
  would be built on the slow static path.
- **One runner abstraction over the command runner too.** It has no coverage and no warm state;
  forcing it into `R20` would leave half the interface unimplemented.

## Out of scope

- Mocha, Jasmine, Karma, Tap, and Jest's legacy `jest-jasmine2`.
- Execution sharing across mutants beyond grouped static survivors (split-stream, AccMut), and
  predictive prioritization: the parent roadmap's `M5` research items.
- Mutation runs in GitHub Actions, or any schedule for the full run.
- New mutators, and any change to which mutants are generated.
- A head-to-head against Stryker on compat-oracle. The parent intent's `SC8` keeps that reading;
  the criteria here compare oxmutate with oxmutate 1.5.0.
- Restating compat-oracle's, burgee's or oxmutate's mutation floors, except as `M0`'s outcome
  requires by decision.
