# Metrics — what "better than Stryker" means, in numbers

Intent: [`intent.md`](./intent.md) · Roadmap: [`roadmap.md`](./roadmap.md) · **Status:** draft,
2026-10-26.

"Better" is not a feeling. `oxmutate` is better than Stryker only on a metric where both tools were
measured by the same script on the same subject and machine, and `oxmutate` beat Stryker by the
stated margin. Every metric below has a definition, a command, a Stryker baseline (measured, or
`TBM` = to be measured in M0), and a target.

- **Leading** metrics move first and predict the outcome. They are checked on every PR.
- **Lagging** metrics are the outcome users feel. They are checked per milestone and weekly.

The primary user is an **agent** (Claude Code or another coding agent) running mutation testing in
a loop: run, read survivors, write a killing test, re-run. Every metric is chosen for that loop
first and for a human second.

## 1. The agent loop — the metrics that decide "better for agents"

| ID | Metric | Kind | Definition | Stryker baseline | Target |
| :-- | :-- | :-- | :-- | :-- | :-- |
| A1 | **Time to first survivor** | Leading | Wall-clock from command start to the first survivor record on stdout (`--json` stream) | TBM. Stryker reports only at the end of the run. | ≤ 10% of Stryker's full-run time on the fixture |
| A2 | **Loop latency** | Lagging | Wall-clock for one agent iteration: re-run after one test file changes (incremental) | TBM (`--incremental`) | ≥ 10x faster |
| A3 | **Parse reliability** | Leading | Share of runs whose `--json` output validates against `contracts/envelope.schema.json` | Not applicable (no envelope; clear-text output) | 100%, every run, every lane |
| A4 | **One-turn kill rate** | Lagging | Share of survivors for which an agent, given only `survivors --json`, writes a test that kills the mutant in one turn. Weekly eval, fixed survivor set, fixed model. | TBM. Same eval run on Stryker's JSON report. | ≥ Stryker + 20 points |
| A5 | **Tokens per actionable survivor** | Leading | Bytes of tool output an agent reads per survivor it can act on (survivor record plus fix line) | TBM (Stryker clear-text plus JSON) | ≤ 50% of Stryker |
| A6 | **Exit-code determinism** | Leading | Share of runs whose exit code matches the documented contract (0/1/2/3/4) for the scenario | Not documented beyond pass/fail | 100% |
| A7 | **Fix-line coverage** | Leading | Share of non-zero exits and survivors that carry a `fix:` line naming the next action | 0% (no fix lines) | 100% |
| A8 | **Agent turns to green** | Lagging | Median agent turns from first run to a mutation score at or above the floor on the eval repo | TBM | ≤ 70% of Stryker |

A4 and A8 are the outcome. A1, A3, A5 and A7 are what we control on every PR to move them.

## 2. Speed

| ID | Metric | Kind | Definition | Stryker baseline | Target |
| :-- | :-- | :-- | :-- | :-- | :-- |
| S1 | **Per-mutant execution time** | Leading | Median ms per executed mutant per worker, mutation phase only | ~160 ms (caique `decide.ts`, 74 mutants, 4 workers, 2026-10-25) | ≤ 20 ms (M0 gate) |
| S2 | **Instrumentation time** | Leading | Wall-clock from start to an instrumented build, per 1,000 source lines | ~2 s for 134–2,900 lines (roundel and caique samples) | ≥ 5x faster (M1) |
| S3 | **Whole-run time, cold** | Lagging | Wall-clock of a full run, no cache, on the fixture | TBM (M0 baseline, 5 runs) | ≥ 5x faster (M1), ≥ 10x (M3) |
| S4 | **Burgee full run on CI** | Lagging | Wall-clock of burgee's full weekly run on the CI runner | 186.21 min (2026-10-24, 13,738 mutants) | ≤ 30 min (M3) |
| S5 | **PR lane p95** | Lagging | 95th percentile wall-clock of the changed-lines lane on burgee PRs | TBM from `quality-full.yml` history (budget 15 min) | ≤ 5 min |
| S6 | **Rerun after a one-file change** | Lagging | Wall-clock of an incremental run after editing one source file | TBM (`--incremental`) | ≥ 10x faster |

## 3. Trust (correctness of the verdicts)

| ID | Metric | Kind | Definition | Stryker baseline | Target |
| :-- | :-- | :-- | :-- | :-- | :-- |
| T1 | **Verdict agreement** | Leading | Share of mutants with the same verdict (killed, survived, timeout, no coverage) as Stryker; each disagreement explained in `bench/disagreements.json` | — (reference) | ≥ 99% |
| T2 | **False-survivor rate** | Leading | Share of reported survivors that a direct run of the covering tests kills | > 0: vitest 5 name-filter fault (burgee, 2026-10-18), worked around in `scripts/mutation-vitest-setup.ts` | 0 on the SC7 fixture and on burgee |
| T3 | **Verdict stability** | Leading | Share of mutants with the same verdict across three identical runs | TBM | ≥ 99.9% |
| T4 | **Static-mutant coverage** | Lagging | Share of static mutants that receive a verdict instead of being skipped | 0% with `ignoreStatic` | 100% |
| T5 | **Instrument-fault detection** | Leading | Share of planted instrument faults (a runner that runs zero tests, a coverage map that is empty) that the run refuses to score (exit 2) | 0 (Stryker scores them) | 100% |
| T6 | **Orphan processes** | Leading | Child processes alive 5 s after a forced abort mid-run | TBM | 0 |

## 4. CI economics

| ID | Metric | Kind | Definition | Stryker baseline | Target |
| :-- | :-- | :-- | :-- | :-- | :-- |
| C1 | **CI minutes per 1,000 mutants** | Lagging | Runner minutes (all shards) divided by mutants scored, on burgee | 13.6 min (186.21 / 13.738k) | ≤ 2 min |
| C2 | **Cache hit rate** | Leading | Share of mutants reused from the incremental cache on a weekly run | TBM | ≥ 90% on a week with typical churn |
| C3 | **Shard balance** | Leading | Slowest shard time divided by the mean shard time | Not applicable (no sharding) | ≤ 1.2 |
| C4 | **Peak memory per worker** | Leading | Max RSS of a worker during a full run | TBM | ≤ Stryker |

## 5. Efficiency (work per unit of compute, separate from wall-clock)

Wall-clock can be bought with more cores. Efficiency cannot, so it is measured separately.

| ID | Metric | Kind | Definition | Stryker baseline | Target |
| :-- | :-- | :-- | :-- | :-- | :-- |
| E1 | **CPU-seconds per mutant** | Leading | User + system CPU time of all processes in the run, divided by mutants scored | TBM (`/usr/bin/time -l` on the bench) | ≤ 20% of Stryker |
| E2 | **Test executions per mutant** | Leading | Test callbacks executed per scored mutant | 3.82 (caique `decide.ts`), 6.80 (roundel) | ≤ Stryker, with the same verdicts |
| E3 | **Wasted executions** | Leading | Share of test executions that could not change the verdict (ran after the mutant was already killed, or never reached the mutant) | TBM | ≤ 5% |
| E4 | **Mutants scored per core-hour** | Lagging | Mutants scored divided by core-hours on burgee's full run | TBM (13,738 mutants / measured core-hours) | ≥ 5x Stryker |

## 6. Formal verification (the bridge to Quint and other methods)

The win the intent names (Anthropic's formal-verification research; burgee's `.qnt` models): a
mutant can be **killed by a spec**, not only by a test, and a mutant that no test and no spec
kills is a measured gap in both. Backends are adapters behind one data contract
(`contracts/spec-oracle.schema.json`, added in M5's first item), so Quint is first and others
follow without core changes: TLA+ through Apalache, property-based specs (fast-check), and
proof systems where the project has them (Lean, Rocq, Dafny).

| ID | Metric | Kind | Definition | Stryker baseline | Target |
| :-- | :-- | :-- | :-- | :-- | :-- |
| F1 | **Spec-kill share** | Lagging | Share of mutants in modelled code killed by a spec oracle (`killedBySpec`) | 0% (no spec oracle) | Reported per component; any value > 0 is a capability Stryker lacks |
| F2 | **Test-spec gap** | Lagging | Mutants killed by the spec but survived by the tests: each one is a missing test, with the spec's counterexample trace attached | Not measurable | Every one listed with its trace |
| F3 | **Spec-escape count** | Lagging | Mutants that survive both tests and spec, in modelled code: gaps in the model itself | Not measurable | Every one listed; trend goes down |
| F4 | **Spec-check cost per mutant** | Leading | Median ms for one spec-oracle verdict (Quint simulation or model check, bounded) | Not applicable | ≤ 2x the per-mutant test cost (S1) |
| F5 | **Backends behind the contract** | Leading | Formal or property-based backends passing the spec-oracle contract tests | 0 | Quint (M5), then one more per quarter on demand |
| F6 | **Mapping coverage** | Leading | Share of mutants in modelled files that map to a spec action or invariant (the bridge from code span to model) | Not applicable | ≥ 80% for a modelled component |

## 7. Adoption (the lagging outcome of all of the above)

| ID | Metric | Kind | Definition | Baseline | Target |
| :-- | :-- | :-- | :-- | :-- | :-- |
| D1 | **Repos running oxmutate in CI** | Lagging | Public repos with `oxmutate` in a workflow file (GitHub code search) | 0 | 10 by M3 + 90 days |
| D2 | **Migrations from Stryker** | Lagging | Repos that removed `@stryker-mutator/core` and added `oxmutate` | 0 | 3 by M3 + 90 days, burgee first |
| D3 | **Weekly npm downloads** | Lagging | `npm` downloads API, 7-day sum | 0 | Reported, not targeted until M3 |
| D4 | **Time to first run** | Leading | Wall-clock from `vpx oxmutate init` in a fresh Vite+ project to a first report | TBM (`npx stryker init` then `run`) | ≤ 2 min, zero prompts in non-TTY |

## First measurements (M0, 2026-10-26)

From [`m0-results.md`](./m0-results.md): es-toolkit `src/array`, 720 mutants, 4 workers, Apple
M4 Pro. Stryker 10.0.0 and oxmutate α (oxc instrumenter + warm runner, 500 ms budget). Medians of 5.

| ID | Stryker | oxmutate α | Target met? |
| :-- | --: | --: | :-- |
| S1 per-mutant execution | ~740 ms per worker | 0.084 ms (p95 2.2 ms) | Yes (≤ 20 ms) |
| S2 instrumentation | ~2 s | 0.33 s | Yes (≥ 5x) |
| S3 whole run, cold | 160.6 s | 9.0 s tool time (11.4 s with harness copy) | Yes (≥ 5x) |
| E1 CPU-seconds per mutant | 0.59 | 0.023 | Yes (≤ 20%) |
| E2 test executions per mutant | 1.57 | 1.51 | Yes (≤ Stryker) |
| T1 verdict agreement | — | 99.72% | Yes (≥ 99%) |
| T3 verdict stability across 5 runs | 99.72–99.86% (Stryker against itself) | 99.58–99.72% against Stryker | Not yet measured as defined (needs 3 identical oxmutate runs compared with each other) |
| T4 static-mutant coverage | n/a (0 static mutants here) | n/a | Not measurable on this subject |
| C4 peak memory | 4.6 GB (largest process) | 1.4 GB (all processes) | Yes |

Not yet measured: A1–A8 (agent loop), S4–S6 (burgee, PR lane, incremental), T2, T5, T6, C1–C3, F1–F6,
D1–D4. Each waits for the milestone that first needs it.

## Rules for these numbers

1. **One script measures both tools.** `npm run bench:mutation` produces every Speed, Trust and CI
   number for Stryker and `oxmutate` in one run, with the machine spec and command lines. A number
   from anywhere else is not published.
2. **Baselines before targets move.** A `TBM` baseline is measured in M0 or the milestone that first
   needs it, before anyone claims a gain on that metric.
3. **A miss is reported.** A metric below target ships as a miss, with the measured value, not tuned
   away or dropped from the table.
4. **Agent evals are fixed.** A4 and A8 use a pinned survivor set, a pinned model and a pinned prompt;
   changing any of the three starts a new series.
5. **Ratchets.** Once a target is met, it becomes a floor in `.sdlc/bands/` in the same style as
   `mutation-ratchets.json`: it only moves up, and a run below it fails.
