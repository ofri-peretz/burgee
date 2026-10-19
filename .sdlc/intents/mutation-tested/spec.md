# Design — a test suite that passes on broken code is found, not assumed away

Intent: [`intent.md`](./intent.md). **Status:** approved.

---

## Requirements

- **R1 — The changed lines, in the affected packages.** `scripts/mutation.ts changed` takes the
  package set from `scripts/affected.mts` and the lines from `git diff -U0 <base>...HEAD`, and
  mutates only those lines (Stryker `mutate: src/x.ts:11-13`), only in mutation sources.
  *Check:* `mutation-lock.test.ts` → "which lines a pull request changed".
- **R2 — A verdict from the report.** Score is detected (killed + timeout) over detected +
  survived + no coverage; ignored and invalid mutants are out of it. Every survived or
  uncovered mutant on a changed line fails the lane and is printed `file:line:column`, mutator,
  replacement. *Check:* "scoring a report".
- **R3 — A budget.** Job `timeout-minutes: 15`; Stryker gets 11 (`PR_BUDGET.wallClockMinutes`),
  `timeoutMS` 10 000 per mutant, a 4-minute dry run, concurrency 4 on the runner. Over budget
  fails with "over the lane's budget", never passes. *Check:* the workflow (`lint-workflows`
  requires the timeout) and the self-test below.
- **R4 — An escape that has to explain itself.** A line may carry
  `// Stryker disable next-line <Mutator>: <reason>` (Stryker's own syntax, so Stryker
  honours it as `Ignored`). Every `Stryker disable` in `packages/*/src` names a mutator or
  `all` and gives a reason of at least 15 characters. *Check:* "`// Stryker disable` carries a
  reason" scans every tracked package source.
- **R5 — A floor per package.** `.sdlc/bands/mutation-ratchets.json` names every package: either
  `measured` with `floor`, `history` and `observations`, or `unmeasured` with a `reason`. The
  floor is the last history step; a step below the one before it cites a newer decision; the
  committed history and observations are append-only. *Check:* "the mutation ratchets".
- **R6 — Measured weekly on `main`.** `mutation.yml` runs `full` per package on Saturdays and on
  dispatch, then `record`: appends the observation, raises a floor the run beat (rounded down to
  one decimal), sets a first floor for a newly measured package, lands it as a PR, and fails
  when a measured package scored below its floor or produced no score. The matrix is exactly
  the ratchet file's packages. *Check:* "recording a weekly run" and "are what the weekly
  workflow measures".
- **R7 — Reported like the other heavy gates, not required.** `Mutation (changed lines)` is a
  job in `quality-full.yml` with the same trigger expression as `test`, `build`, `typecheck` and
  `coverage`, a row in the `Quality (Full) Gate` summary, and a `needs` edge into it. It is not in
  `REQUIRED_CHECKS`. *Check:* `quality-full-trigger-lock.test.ts` (`HEAVY` gains `mutation`).
- **R8 — A report that measured nothing is refused.** A survivor with coverage and zero tests
  completed fails the run as an instrument fault. *Check:* "refuses a covered survivor that ran
  no test", built from the real report that exposed the runner defect.

## Design

**One script, three commands** (`scripts/mutation.ts`, run with `tsx` like the other SDLC
scripts): `changed` for the PR lane, `full` for one package, `record` for the weekly fold.

**What is a mutation source** is `isMutationSource`: `src/**/*.{ts,mts,cts}` minus `*.test.ts`,
`.d.ts`, `__fixtures__` and `TESTED_IN_ANOTHER_PROCESS`, imported from
`vitest-coverage.config.ts`. Those last files are graded by an incumbent's suite in a child
process (commander's 1,360 cases, chalk's 58, ink's 584 …); a mutant there is invisible to the
package's own in-process suite, so mutating them would measure the wrong suite.

**Stryker's configuration** (`strykerConfig`), each value for a measured reason:

| Option | Value | Why |
| :-- | :-- | :-- |
| `testRunner` | `vitest` | every package's suite is vitest 5 |
| `inPlace` | `true` | each package's `vitest.config.ts` imports `../../vitest-*.config.ts` and its tests resolve siblings through the workspace; a sandbox copy breaks both. `runPackage` checks `git status` of `src/` afterwards |
| `disableTypeChecks` | `false` | vitest does not type-check, and in place it writes `// @ts-nocheck` into every file under `src/` — `roundel`'s `shape.test.ts` reads `index.ts` as text and failed the dry run |
| `coverageAnalysis` | `perTest` | each mutant runs only the tests that reach it; `all` and `off` were tried and are no help (below) |
| `vitest.related` | `false` | the second false-survivor defect. A mutant the runner sends without a test filter is narrowed to the suites "related" to the mutated file, and under vitest 5 that came back empty: on `roundel/src/import.ts:104-114`, 5 of 20 mutant runs found no test file and ran nothing, and the first full `roundel` run was refused with 84 such survivors, all in `import.ts`. Off, those runs take every suite; the dry run is slower, the score is real |
| `vitest.configFile` | `<package>/.mutation/vitest.config.ts`, written per run (`wrapperConfig`) | the package's own config, imported statically so vite resolves its `../../vitest-*.config.js` imports, plus the name-filter shim and the per-package `SKIPPED_TESTS` |
| `timeoutMS` | `10000` | added to a mutant's measured time before it counts as an infinite loop; this machine and a shared runner both run loaded |
| `concurrency` | 4 in CI, 2 locally | four vCPUs on `ubuntu-latest` |

**The vitest 5 name-filter defect, and the shim.** `@stryker-mutator/vitest-runner@10.0.0` (the
newest, 2026-08-14) names a test `suite test` and filters each mutant run with that as
`testNamePattern`. vitest 5 matches the pattern against `suite > test`. Shown on
`roundel/src/contrast.ts:69-100` with a debug line in the runner: mutant 13 (the error message
replaced by `` ` ` ``) ran with filter `contrast accepts short hex and rejects nonsense`, both
files came back `skip`, zero tests ran, and it was reported **Survived** — although
`toThrow(/not a hex colour/)` kills it. `coverageAnalysis: 'all'` and `'off'` still sent the
filter (the runner always reports per-test coverage), and `maxTestRunnerReuse: 1` changed
nothing. `scripts/mutation-vitest-setup.ts` runs in the worker before collection and widens each
space in the pattern to `(?: | > )`; with it, mutants 13 and 4 are killed and the score on that
range moves from 85.19% to 92.59%. Because the shim reaches into vitest's worker state, R8 stands
behind it: if it stops working, the report shows covered survivors with zero tests and the run
fails instead of reporting them as gaps.

**Suites a mutation run skips** (`SKIPPED_TESTS`), found by the dry run failing, each with its
reason, skipped by the mutation run only:

- `roundel/src/weight.test.ts` — bundles `src` and holds it to a byte ceiling (14,600 B);
  instrumented source is larger by construction (14,646 B in the dry run).
- `burgee/src/migrate-bench.test.ts` — A10 times a 1,000-file scan against a CPU yardstick
  (budget 40); instrumented code ran it at 3,644.
- `burgee/src/messages.test.ts` — scans the text of `src/` for every message the engine
  writes; instrumented source holds each literal behind a mutant switch.
- `burgee/src/testing-helpers.test.ts` — compares `JSON.stringify(process.env)` byte for byte;
  Stryker's runner forces vitest's `threads` pool, where restoring the env reorders its keys.

Each was found by a dry run failing (`disableBail` and `dryRunOnly` on burgee list them all at
once). Skipping a file costs the kills its tests would have made; the four above are a lock on
text, a timing budget and an env-ordering assertion, none of them the suite that exercises the
logic.

Not skipped, and so not yet measured: `linegauge/src/width.test.ts` compares the text of
`src/width.ts` with the tables its generator writes, which instrumented source never matches.
It is also the suite that kills `width.ts`'s mutants, so skipping the file would measure a
package with its main suite removed. linegauge stays `unmeasured` until that check moves to its
own file.

**A run never leaves a package instrumented.** `runPackage` keeps the text of every file it
mutates and writes back any file that differs after Stryker exits (in place, a killed run may
not restore), and such a run's report is refused. Compared with the text before the run, not
with git, so uncommitted work is neither flagged nor lost — the first seed run of `roundel`
was refused by a `git status` check for exactly that.

**The PR lane** (`quality-full.yml` → `mutation`): a `--plan` step decides whether any source
line changed; only then are packages built and Stryker run. A PR that changes no package source,
and every event other than a pull request or a merge-queue entry, reports success from a step.
The merge queue diffs against `merge_group.base_sha`.

**The weekly run** (`mutation.yml`): one matrix cell per package, `max-parallel: 3`, 300-minute
cells, results uploaded as artifacts; `record` folds them and lands a PR on the same credential
chain as `control-bands.yml`, then fails on a breach. A failed run of an `unmeasured` package
records its error as the reason and does not fail the workflow; the same of a `measured` one is
a breach.

## Verification

```sh
npx vitest run --config vitest.root.config.ts scripts/mutation-lock.test.ts scripts/quality-full-trigger-lock.test.ts
npx tsx scripts/lint-workflows.ts
npx tsx scripts/mutation.ts full --package roundel --concurrency 2
```

The self-test of the lane is recorded under *Shipped* in the intent.

**Quint: no model.** The routing question in [`JEV-AND-QUINT.md`](../../JEV-AND-QUINT.md) is
whether the behaviour involves states, ordering, concurrency, retries, deadlines or
exactly-once. It does not, in the sense a model would check:

- the lane is a pure function from (diff, report) to an exit code — held by unit cases, which
  are a complete specification of a function with no hidden state;
- the ratchet is a monotone sequence (a floor never decreases without a cited decision), held
  by the lock against the committed file — one invariant over one list, not an interleaving;
- the only concurrency is Stryker's own worker pool and GitHub's matrix, neither of which this
  design controls, and the weekly workflow has `cancel-in-progress: false` with one `record`
  job, so two writers never race on the ratchet file.

The one temporal property — "a run over budget fails, never passes" — is a deadline with a
single actor; `spawnSync`'s `timeout` enforces it and the error path is one branch.

## Rejected alternatives

- **Mutate whole changed files in the PR lane.** A one-line fix in `burgee/src/help.ts` would
  owe every pre-existing survivor in the file. The lane is about the lines a PR is responsible
  for; the weekly ratchet owns the rest.
- **A Stryker `break` threshold per package.** Stryker's threshold is a constant in a config;
  a ratchet needs history, observations and a rule that it only moves up, which is what
  `.sdlc/bands/` already does for the other bands.
- **Patching `node_modules/@stryker-mutator/vitest-runner`** (or `patch-package`) to join with
  ` > `. Tried on the runner's `test-helpers.js`: test results and coverage ids then disagree
  and the mutant became `NoCoverage`. The shim changes the filter only, in the one place both
  sides agree on.
- **`coverageAnalysis: 'off'`** to avoid the filter: the runner still sent one.
- **Making the lane a required context.** The owner asked for it not to be. It feeds the
  required `Quality (Full) Gate` like the other heavy jobs, which is the same weight `coverage`
  carries.
- **Pinning `vitest` back to 4** so the runner's join matches. Every package's suite runs on 5;
  moving the test framework to suit the mutation tool inverts the dependency.

## Out of scope

- Killing the survivors the seed runs found. They are listed in the PR as follow-up work; this
  intent builds the gate and the ratchet, not the tests.
- Mutating `scripts/`, `benchmarks/` and the docs apps. They are not published packages; their
  locks are their own tests.
- Reporting the runner defect upstream (the intent's open question).
