---
id: D-20261101-tests-under-5s
subject: 'No test case takes more than 5 s: a reporter in every suite fails the run on one that does, the slow cases were made fast without weakening them, and the ones that need a whole mutation run each moved to the nightly job by name'
taken: 'Taken — the owner''s directive of 2026-11-01'
date: '2026-11-01'
superseded_by: —
---

> **Amended 2026-11-01 by [D-20261101-no-mutation-in-gha](./D-20261101-no-mutation-in-gha.md).**
> The NIGHTLY_ONLY cases each run oxmutate end to end, and no mutation runs in GitHub Actions, so
> compat.yml's `heavy-tests` job and its `nightly-report.yml` entry are removed. `npm run
> mutation:weekly` runs the same four files with `BURGEE_NIGHTLY=1` and `OXMUTATE_REQUIRE_NATIVE=1`
> before the full mutation runs, fails (exit 1) when one is red, and opens or updates the issue
> "Weekly nightly-only test cases failed". Wherever "the nightly job" appears below, read that run.

**The owner, 2026-11-01:** "We need to fix bottlenecks" and "it doesn't make sense a single test
case will take more than 5 seconds".

## What was measured

`Quality (Full)` run 41333344269 on main (ubuntu, the required `Unit Tests` job), per case from the
default reporter's slow-case lines: **46 cases over 5 s**. The root suite (`vitest.root.config.ts`,
also pre-push `root-suite`) took 177.6 s; its two slowest cases were 90.3 s and 26.7 s, both in
`plan-progress-lock.test.ts`. In the package suites the slowest were compat-oracle's band lock
(62.7 s), oxmutate's Vitest 5 regression (28.7 s), the B5 log-update rounds (16.7 s), oxmutate's
sensitivity check (16.1 s) and type checker (15.1 s), and roundel's supports-color property
(14.1 s). No timeout caught any of them: every suite runs under `testTimeout` 30 s or more
(`vitest-timeouts.config.ts`), because a timeout is a bet on the machine.

**After** (PR #1424, run 41353301389, the same job): no case over 5 s alone. Eight read over it
inside the four-way battery and 1.6–2.7 s alone; the root suite took 104.9 s (from 177.6 s), and
`plan-progress-lock` 5.6 s, `api-reference-lock` 6.6 s, compat-oracle's band lock 3.6 s.

## The rule, and the gate that holds it

`scripts/vitest-case-budget-reporter.ts` reads each case's own duration after the run and sets the
exit code to 1 when any is over **5,000 ms**. It is loaded by every vitest config in the
repository, through `timeouts` or, for the three configs with their own clocks, `caseBudget`
(`scripts/case-budget-lock.test.ts` holds that). So it runs in the pre-push battery and root
suite, and in the required `Unit Tests` job.

- **A case over the budget is measured again, alone**, before it fails the run: its file runs by
  itself with `-t` naming it, up to twice, and the case fails only if its best alone reading is
  over the budget too. On the development machine (endpoint scanning at 170% CPU) a pure
  computation read 7.4 s in a full suite and milliseconds alone, and one release-loop case read
  5.7 s and 16.4 s in two runs of one tree; a gate that is red on load is a gate people learn to
  re-run. The readings are printed.
- **Inside a battery the re-measuring waits for the battery.** With `turbo run test` running
  several suites at once nothing is alone (a closeout case whose `npm pack` takes 0.5 s read 17.5 s
  in the pre-push battery and 10.0 s re-run inside it), so there each run writes its candidates to
  `VITEST_CASE_BUDGET_DEFER` and `scripts/case-budget.ts` judges them after: the `No test case over
  5 s` step in `Unit Tests`, and the `case-budget` pre-push command. The root suite runs alone and
  judges its own.
- **Off CI, an overloaded machine leaves a case unjudged, not failed.** When every alone reading
  was taken with the load average above the core count, a developer's pre-push prints the case
  as unjudged and the required check judges it on a runner, where `CI=true` makes every reading
  count. The machine this was written on sits at a load of 25–35 on 14 cores; in one pre-push a
  lock that reads one file read 14 s alone, and `docs-controlroom`'s cleanup hook timed out at
  60 s with no gate involved.
- **compat.yml's cells do not judge it** (`VITEST_CASE_BUDGET_MS=0`): they grade correctness on
  every OS, and the budget is held in one CI place, the required `Unit Tests` job.
- **Not judged:** a run with coverage on (v8's counters slow the body; `Unit Tests` gates the
  same cases uninstrumented in the same required check), and compat's cells, as above.
- **`NIGHTLY_ONLY` is the only exemption.** An entry is a case that runs only where
  `BURGEE_NIGHTLY` is set — compat.yml's `heavy-tests` job, nightly and on a dispatch
  (D-20261101-heavy-ci-runs-nightly) — with the heavy operation it needs as its reason. The lock
  checks each entry's file reads `BURGEE_NIGHTLY`, has the case, and is run by that job.

Proven red on main's state: the root suite exited 1 naming `plan-progress-lock.test.ts`'s two
cases at 47.6 s and 21.9 s (local), and green after.

## How each slow case was made fast

| case(s) | cause | fix |
| --- | --- | --- |
| `plan-progress-lock` ×2 (90.3 s, 26.7 s) | spawned the whole 36-condition report twice, and the control-band watcher | the conditions are asked in-process (`STEPS`, `landed`, `report` exported; the report runs only as a script), one case per step; the roadmap check both 0.2 and 2.5.0 ran is run once |
| compat-oracle `bands.test.ts` (62.7 s) | `control-bands.ts` re-parsed ~60 MB of results per band | `readDated` keeps what it parsed per directory, keyed on every file's size and mtime |
| `api-reference-lock` (89.6 s file, cases to 2.9 s) | a fresh program per entry re-parsed lib and `@types/node` ~200 times | one parse per declaration file, shared through the compiler host (38.5 s → 5.8 s locally) |
| `claim-table-lock` (5.1 s) | re-read every results document per claim | read once per directory |
| `release-order-lock` loop (2.2 s on CI, 5–16 s locally) | fresh `npm`/`git`/`gh`/`sleep` stubs per run, and a Node start per manifest read in the `npm` stub | stubs written once; the stub reads the manifest with `jq`, which the step under test already needs |
| `deploy-lock` (to 5.3 s locally) | wrote fresh `curl`/`sleep` stubs per run, and one case ran five retry loops | stubs written once; the case split per answer |
| compat-oracle `run.test.ts` tsd ×2 (13.7 s, 11.1 s) | tsd's default libs type-check `lib.dom.d.ts` with skipLibCheck forced off | the fixture names `lib: ['es2020']` (2.5 s → 0.85 s locally) |
| compat-oracle `grade.test.ts` (4.0 s) | two grades in one case | two cases |
| B5 log-update rounds (16.7 s) | timed log-update for real to get ~1.1 MB of stderr | a fixture that writes 2 MiB through the same `sample()`; the real rounds run nightly in bench.yml |
| B5 parity (5.1 s), cold-start fixtures (6.5 s) | sixteen / every variant's spawns in one case | one case per pair / variant |
| `agent.test.ts` print-config (10.0 s) | waited out the real 10 s timeout | `mcpConfig` takes the timeout; the case uses 300 ms, another holds the 10 s |
| roundel supports-color (14.1 s) | 3,000 worlds, each re-importing the module, in one case | six cases of 500 |
| dashboard ×2 (11.8 s, 11.1 s) | five batches of twenty runs in one case | one case per batch |
| docs-bellpull `stubborn.mjs` (5.4 s) | the page's example waited 5 s for its deadline | the example's deadline is 1 s (and `host.mjs`'s 3 s stop is 1 s); the output is the same |
| burgee `parseCommand` exhaustive (5.4 s) | ~200,000 commands in one case | one case per shape |
| oxmutate T6 (7.1 s) | a fixed 5 s wait for orphans | polls, up to the same 5 s |
| oxmutate `thresholds.break` (6.5 s), Vitest 5 clean run | two runs in one case; the clean run made twice | one run per case; the clean run shared |

## What moved to the nightly job, and why

Fifteen oxmutate cases, each a whole oxmutate run on a fixture (CLI, Vitest servers, every mutant)
or the real compiler, 6.4–28.7 s on a contended runner: ten in `e2e.test.ts`, both in
`sensitivity.test.ts`, the two run-backed cases in `vitest5-regression.test.ts` and the real-tsc
case in `checker.test.ts`. They are listed with their numbers in `NIGHTLY_ONLY`. Only oxmutate's
source can make them fast — a faster cold path for a run — and two other lanes own that source
today, so it is a follow-up, not part of this change. Each leaves the list by getting fast.
