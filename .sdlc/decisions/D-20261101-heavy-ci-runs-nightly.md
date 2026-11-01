---
id: D-20261101-heavy-ci-runs-nightly
subject: 'Heavy work does not run during CI/CD: benchmarks, the Node-floor published-suite cells and the off-Linux controls run on a nightly schedule, the paid evals weekly, and pull requests keep only the gates — every required check among them'
taken: 'Taken — the owner''s directive of 2026-11-01'
date: '2026-11-01'
superseded_by: —
---

> **Amended 2026-11-01 by [D-20261101-no-mutation-in-gha](./D-20261101-no-mutation-in-gha.md).**
> Mutation left GitHub Actions altogether: `mutation.yml` and the `Mutation (changed lines)` job in
> `Quality (Full) Gate` are removed. The full run is `npm run mutation:weekly` on the owner's
> machine (Saturday 02:30 local, launchd), and the changed lines are mutated in pre-push. Every row
> and schedule line below that names `mutation.yml` or the changed-lines job is read through that
> decision; the rest of this one stands.

**The owner, 2026-11-01:** "ensure we're not running heavy tasks during CI-CD, benchmarks, etc
should be running through a scheduler over night".

**What changes.** A pull request runs the gates and nothing else. A push to `main` runs the two
gates `release.yml` waits for (`Quality Gate`, `Quality (Full) Gate`) and nothing heavy. The heavy
jobs run on a nightly cron between 03:00 and 05:00 UTC, staggered, plus `workflow_dispatch`; a
failed night opens an issue, or comments on the open one.

| workflow | before (`on:`) | after (`on:`) | heavy part, now nightly | stays on a pull request |
| --- | --- | --- | --- | --- |
| `bench.yml` | pull_request, push, schedule (weekly), dispatch | pull_request (`paths-ignore: benchmarks/results/**`), schedule `0 3 * * *` + `40 5 * * 2`, dispatch | `cheap` (B2 cold start, B3 compat suite, B4, B5 runtime, reliability; lands the night's observation), `floor` (N10 artifact) | new `gate` job: B4 weight, reliability and the N10 floor, each `--check` |
| `compat.yml` | pull_request, push, merge_group, dispatch | pull_request, merge_group, schedule `30 3 * * *`, dispatch | off-Linux `controls` (informational), the six `floor` published-suites cells | `ratchet`, `affected`, the three Node 24 cells (all four required) |
| `evals.yml` | pull_request (paths), schedule (weekly), dispatch | schedule (weekly, unchanged), dispatch | the paid task evals (layer 2) | — (layer 1 already runs in `quality.yml`, inside `Quality Gate`) |
| `mutation.yml` | schedule (weekly), dispatch | unchanged | the full run | changed-lines lane, inside `Quality (Full) Gate` |

B1 (`bench.yml` → `agent`) stays weekly on its own cron, `40 5 * * 2`: the nightly cron does not
start it (`github.event.schedule` tells the two apart), so it does not spend the Claude quota seven
times a week. A pull request labelled `bench:agent` still asks for it, as before. A pull request
labelled `run-full-ci` still asks `compat.yml` for the whole matrix.

## Measured before deciding

The last 20 completed runs of each workflow, read on 2026-11-01 with `gh run list --json` and `gh
run view --json jobs`; cancelled runs left out; medians per run. *Job-minutes* is the sum of the
jobs' own durations, the runner time a run takes from the shared pool. The window is 2026-10-30
16:22Z to 2026-10-31 13:41Z for `bench.yml`, and 2026-10-31 07:55Z to 13:41Z for `compat.yml` and
`quality-full.yml`.

| workflow | event | runs | wall (min) | jobs | job-minutes |
| --- | --- | --- | --- | --- | --- |
| `bench.yml` | pull_request | 10 | 13.1 | 2 | 16.5 |
| `bench.yml` | push | 4 | 14.2 | 2 | 15.8 |
| `compat.yml` | pull_request | 7 | 18.0 | 13 | 91.8 |
| `compat.yml` | push | 7 | 19.8 | 13 | 102.7 |
| `quality-full.yml` | pull_request | 7 | 11.3 | 6 | 19.3 |
| `quality-full.yml` | push | 7 | 11.0 | 6 | 22.5 |
| `quality.yml` | pull_request | 12 | 2.0 | 3 | 2.2 |
| `evals.yml` | pull_request | 19 | 1.1 | 1 | 1.1 |
| `runtime-smoke.yml` | pull_request | 12 | 0.7 | 2 | 1.1 |
| `completions.yml` | pull_request | 12 | 1.2 | 1 | 1.1 |
| `models.yml` | pull_request | 13 | 2.5 | 1 | 2.5 |

Per job, the ones that decided it (median minutes, pull request / push): the bench `cheap` job
12.8 / 12.7, of which the axes alone took perf 2.3, compat 5.3, weight 0.6, reliability 0.05 and
runtime 0.9 (run 41205333122, the rest is the build); the bench `floor` job 3.8 / 3.2, of which
grading is 17 s; compat `ratchet` 17.5 / 16.6; the Linux Node 24 cell 14.8 / 18.8; Windows 9.8 /
14.1; macOS 6.1 / 11.4; each off-Linux `controls` job 15.2; the six `floor` cells 2.1–5.0 each.
`Unit Tests (Turbo)` in `quality-full.yml` is 10.5.

Two more numbers. 35 of the 148 pull requests merged from 2026-10-25 to 2026-10-31 were the bench
recorder's `chore(benchmarks): record benchmark observations`, about five a day, each one a push
that ran `bench.yml` and `compat.yml` again and superseded a release run
([D-20261029-release-waits-not-skips](./D-20261029-release-waits-not-skips.md)). And all 19 of the
measured `evals.yml` pull-request runs failed, in about 20 seconds: the job installs `claude` and
starts the paid task evals against the same weekly quota the required `review` check spends.

## Gate or heavy

A **gate** is fast and protects what merges; it stays. **Heavy** is a benchmark, the full OS ×
Node matrix, the published-suites cells, the paid evals, the full mutation run, or anything of ten
minutes or more that is not a correctness gate.

| job | minutes (PR median) | class | why |
| --- | --- | --- | --- |
| `Quality Gate` and its three jobs | 2.0 | gate | required; release waits for it |
| `Quality (Full) Gate`: tests, build, typecheck, coverage, changed-lines mutation | 11.3 | gate | required; release waits for it; `Unit Tests` is 10.5 and is the correctness gate itself |
| compat `ratchet` | 17.5 | gate | required; over ten minutes, but it is the graded scoreboard |
| compat Linux Node 24 cell | 14.8 | gate | the hard-gated suite on the platform the baselines are recorded on |
| compat macOS / Windows Node 24 cells | 6.1 / 9.8 | gate | required checks since 2026-11-01 (see below); 11.4 / 14.1 on a push, which no longer runs them |
| compat off-Linux `controls` | 15.2 each | heavy | informational (`continue-on-error`) |
| compat `floor` cells (Node 20.19, 22.13 × three OSes) | 2.1–5.0 each | heavy | the published-suites cells |
| bench B4 weight + reliability + N10 floor | ~0.7 of axes on one build | gate | bytes, exit codes, a checklist score: no runner in the number, so a PR can be held to them |
| bench B2 cold start, B3 compat suite, B5 runtime | 8.5 of axes | heavy | milliseconds are a property of the runner, and B3 re-runs a suite `ratchet` already gates |
| bench B1 agent | weekly | heavy | paid; already weekly ([D-20261019-b1-weekly-not-per-push](./D-20261019-b1-weekly-not-per-push.md)) |
| evals layer 2 | 1.1, red 19 of 19 | heavy | spends the Claude quota; layer 1 is in `Quality Gate` |
| full mutation | hours | heavy | already weekly |
| runtime smoke, completions, models | 0.7–2.5 | unchanged | measured light; completions and models are gates; runtime smoke is informational but costs about a minute |

B4 runs on its own on a pull request: it was bundled inside the 12.8-minute `cheap` job, so it is
split out into `gate`, beside reliability and the floor ratchet, on one build.

## What it saves

Per pull request, about **55 runner-minutes**: `compat.yml` from 91.8 job-minutes to about 48.5
(affected 0.3, ratchet 17.5, the Linux, macOS and Windows cells 14.8, 6.1 and 9.8; the controls'
30.4 and the floor cells' 22.0 no longer start), `bench.yml` from 16.5 to 5.3 (`gate` on this PR,
run 41296456619: build 3.9, weight and reliability 0.7, floor 0.3), and `evals.yml`'s 1.1 on the
pull requests its paths matched. Wall time per PR does not move much: the ratchet, at 17.5
minutes, was and is the longest job.

Per push to `main`, about **118 runner-minutes**: `bench.yml` (15.8) and `compat.yml` (102.7) no
longer run. And the bench recorder lands once a night, not after every push, so its pull request
(five a day measured, each running the whole PR suite and then a push) is at most one a day.

Added: one nightly `bench.yml` run (about 16 job-minutes) and one nightly `compat.yml` run (about
103), at 03:00 and 03:30 UTC when nothing else asks for the pool.

## The schedule

| UTC | workflow | cadence |
| --- | --- | --- |
| 02:30 Sat | `mutation.yml` (full, 4 h+) | weekly, unchanged |
| 03:00 | `bench.yml` cheap axes + N10 floor, lands the night's observation | nightly |
| 03:30 | `compat.yml` ratchet + the three Node 24 cells + controls + floor cells | nightly |
| 04:00 Sun | `quality-full.yml` drift scan | weekly, unchanged |
| 05:40 Tue | `bench.yml` B1 agent cost | weekly, unchanged |
| 06:20 Sat | `evals.yml` paid task evals | weekly, unchanged |

The full mutation run was left on Saturday 02:30. One run takes over four hours, so it overlaps the
03:00–05:00 window wherever it starts in it; moving it would not avoid the overlap, and oxmutate's
SC11 is defined on a weekly run. GitHub starts scheduled runs late under load: the Tuesday 05:40 B1
run of 2026-10-27 started at 10:58. The stagger is a request, not a guarantee.

## Kept safe

- **Every required check still reports on a pull request.** While this was being built the owner
  set `main`'s required checks to nine, strict off: `Quality Gate`, `Quality (Full) Gate`,
  `Ratchet · each host's suite against burgee`, `Node 24 · ubuntu-latest`, `Node 24 ·
  macos-latest`, `Node 24 · windows-latest`, `CodeQL`, `Changeset present` and `bash, zsh, fish,
  pwsh complete the demo`. A first cut of this change ran only the Linux Node 24 cell on a pull
  request; with macOS and Windows required, that would have held every PR at BLOCKED with nothing
  failing, so the three Node 24 cells stay on every pull request. What left the pull request is
  only what no required check names: the Node 20.19 and 22.13 published-suite cells, the
  informational off-Linux controls, and the benchmark axes.
- **Release verify still finds its gates.** `quality.yml` and `quality-full.yml` keep their push
  trigger and their gate jobs; `release.yml`'s `CHECKS` (`Quality Gate|Quality (Full) Gate`) is
  untouched. `compat.yml` losing its push trigger does not touch release: it was never in `CHECKS`.
- **A red `main` is still loud.** The ratchet's "main is red" issue now fires from the nightly run,
  and comments on the open issue each further red night. A `report` job in each of `bench.yml` and
  `compat.yml` opens or comments on "Nightly benchmarks failed" / "Nightly compatibility matrix
  failed".
- **What a red night costs.** A Node 20.19 or 22.13 regression, or a cold-start or runtime ratchet
  breach, can now merge and be found the next night instead of on the PR. That is the trade
  the directive makes. A PR expected to move one of them can ask for it: `run-full-ci` for the
  compat matrix, a dispatch of `bench.yml` for the cheap axes.

## Held by

- `scripts/heavy-ci-nightly-lock.test.ts` (new): every heavy job, evaluated from the workflow's
  `on:` and its own `if:` over push, merge-queue and pull-request events, does not start; each of
  the nine required checks is produced, under its exact name, by a job that runs on a pull request
  (matrix names expanded, `CodeQL` from the analyze step's upload) — run against the Linux-only
  matrix of this branch's first cut, the macOS and Windows cases fail (5 cases); the nightly crons
  sit in 03:00–05:00 at different minutes; each nightly workflow has one issue-opening failure
  reporter; only the scheduled bench run lands; the nightly cron does not start B1; both release
  gates still report on a push to `main`; the ratchet still reports on every PR; B4 weight still
  gates every PR.
- `scripts/bench-loop-lock.test.ts`: `bench.yml` has no push trigger, measures on a daily cron, and
  ignores a PR that only moves `benchmarks/results/`.
- `scripts/b1-lands-lock.test.ts`, `benchmarks/ci-axes.test.ts`: B1 lands from the schedule and an
  arm dispatch only; the nightly cron neither starts the job nor turns on the MCP arm; the PR `gate`
  job selects exactly weight, reliability and floor, each `--check`ed.
- `scripts/eval-history-lock.test.ts`: `evals.yml` has no pull-request trigger, and layer 1 still
  runs in `quality.yml`.

Run against `main`'s workflow files first, 25 of the new and changed cases fail there (18 in the
four root locks, 7 in `ci-axes`). The ones that pass on both sides are the preservation cases: the
nine required checks on a pull request, the two release gates on a push, the `run-full-ci` escape
hatch.

## Not touched

`oxmutate-native.yml`, `oxmutate-bench.yml` and the oxmutate rows in `release.yml` belong to
another session. As read on 2026-11-01 they already comply: the native build runs from a release
or a dispatch, and the oxmutate bench is dispatch-only.

## Rejected

- **Nightly evals.** The directive says nightly; the paid layer stays weekly, an hour after the
  quota resets ([B-20261026-evals-run-after-quota-reset](../gaps/B-20261026-evals-run-after-quota-reset.md)).
  Seven runs a week would spend the quota the required `review` check needs.
- **Keeping the compat ratchet on a push to `main`.** It is not a release gate, and a push run is the
  pull request's own grade a second time. The nightly run grades `main` and reports red.
- **A slimmer `Quality (Full) Gate` on a push.** Its jobs are the correctness gates the release
  publishes on, and at a median 11 minutes it is not where the pool went.
