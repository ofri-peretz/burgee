# Design — a pull request runs what it can have changed; `main` runs everything

Intent: [`intent.md`](./intent.md). **Status:** approved.

---

## Build status — 2026-10-26

**R1–R4 built.** R1–R3 landed in #1101 (2026-10-18); R4 once twenty PRs had run on the new lanes.
Each check was written first and shown failing on main.

| R | Status | Check, shown failing on main |
| :-- | :-- | :-- |
| R1 | Built | `scripts/affected.test.ts`: 25 cases red with no `scripts/affected.mts` (`Cannot find module`) |
| R2 | Built | `npm run lint:workflows`: `compat.yml → matrix` and `→ floor` do not take their set from `scripts/affected.mts` |
| R3 | Built | `npm run lint:workflows`: `quality-full.yml → test` reads no set; `→ coverage` runs `turbo ls` itself |
| R4 | Built | `scripts/ci-minutes.test.ts`: red with no `scripts/ci-minutes.ts` (`Cannot find module`), then red on its last case until the decision quoted the reading; a reading with the sides swapped fails three cases, a hand-edited median two |

**R4's reading** (`benchmarks/results/ci-minutes/2026-10-26.json`, D-20261026-ci-affected-lanes-minutes):
median compat job-minutes per PR 411.8 before, 71.1 after; per run 177.3 before, 53 after.

Choices made while building R4, each written into `scripts/ci-minutes.ts`:

- **"After" is the first twenty PRs opened after #1101 merged**, not merged after it: a PR open
  across the merge ran some of its runs on the old workflow.
- **A PR with no `pull_request` run is passed over, not counted as zero**: a release PR whose
  compat run was dispatched never asked for the lanes.
- **Runs are matched by head branch and the PR's open window**: bench PRs reuse one branch name
  each, and a run's `pull_requests` is empty once the branch is deleted.
- **Every job counts, cancelled ones too**: a cancelled job held a runner while it ran. Queue
  time does not.

**Mutation.** `scripts/` is outside the PR lane's Stryker gate (it mutates `packages/*/src`), so
`scripts/ci-minutes.ts` was run through Stryker 10 by hand against `ci-minutes.test.ts`: 119
killed, 0 survived. The 72 with no coverage are the `gh` calls, which the lock does not reach by
design; the 10 ignored carry a `Stryker disable` with the reason (two load-time constants the
in-process runner cannot re-evaluate, each shown failing the lock when applied by hand, and the
entry-point guard).

Three choices made while building, each erring toward running more:

- **Any root-level file selects everything**, not only the listed configs: burgee's
  `shape.test.ts` reads the root README, and telling the rest apart buys little. So do a
  package's own `package.json`, `.github/` (actions too) and `.sdlc/bands/`, which every
  `weight.test.ts` reads.
- **Paths a suite reads outside its package** select that package and its dependents
  (`UNDECLARED_READS`: `examples/` and the compatibility page for burgee, `.sdlc/intents/` for
  compat-oracle), because turbo's change detection stops at the package directory.
- **The merge queue runs everything** in `coverage` too; it used to diff against the queue's
  base. `quality-full.yml`'s `test` filters on every affected workspace, docs apps included, so
  a docs-app change still runs that app's suite.

## Requirements

- **R1 — One affected set.** `scripts/affected.mts` prints the affected packages as JSON from
  `turbo ls --filter='...[<base>]'` limited to `packages/*`, and prints every package when any
  root path in the intent's list changed or when the event is not `pull_request`. *Check:*
  `scripts/affected.test.ts` (new) runs it over a temporary git repository: a change under
  `benchmarks/results/` gives `[]`; one under `packages/linegauge/src` gives linegauge and its
  dependents; one to `turbo.json` gives all. Red on main: no script.
- **R2 — `compat.yml` reads it.** `matrix` and `floor` build and test only the affected set on a
  PR, and when it is empty each cell runs one step that says so and exits 0. *Check:*
  `scripts/lint-workflows.ts` gains a rule that both jobs take the set from `scripts/affected.mts`
  and that the `push`, `merge_group`, `schedule` and `workflow_dispatch` events select every
  package; red on main, neither job reads a set.
- **R3 — `quality-full.yml`'s `test` reads it.** The locks step stays full; `turbo run test`
  takes the affected filters. The `coverage` job's inline set computation is replaced by the
  script, so there is one. *Check:* the same lint rule; red on main.
- **R4 — Measured.** `benchmarks/results/ci-minutes/` records, for the 20 PRs before and after,
  compat job-minutes per PR from the Actions API (`scripts/ci-minutes.ts`), published in a
  decision. *Check:* `scripts/ci-minutes.test.ts`: the file exists, its summaries are what its
  rows compute, its "after" median is below "before" (also per run, and with the bench-series
  PRs set aside), and the decision quotes it; on main there is no file. The script reads the
  API and computes; the counting is pure functions over the runs it is handed, so there is no
  state and no model.

## Design

Mirror the `coverage` job, which already computes `...[base]` and builds every package before
testing the affected ones (a suite may import a package it does not declare). The ratchet job
keeps grading every host: it is one job and the scoreboard is the product.

Order: R1, then R2 and R3 in one PR (one PR at a time in `.github/workflows/`), then R4 after
twenty PRs.

## Verification

| R | Check | Red on main |
| :-- | :-- | :-- |
| R1 | `scripts/affected.test.ts` | no script |
| R2, R3 | `npm run lint:workflows` (`scripts/lint-workflows.ts` rule) | jobs read no set |
| R4 | `scripts/ci-minutes.test.ts` over `benchmarks/results/ci-minutes/` and its decision | no script, no reading |

No state machine; no model.

## Rejected alternatives

- **`paths:` filters on the workflow.** A required check that never starts blocks the merge
  forever (the reason `compat.yml` carries `merge_group`).
- **Drop a Node or an OS from the matrix.** C3 is a published claim: every Node LTS in `engines`
  on three OSes.
- **Run the matrix only on `main`.** A Windows-only break would land and turn `main` red for every
  open PR; the affected set keeps the cell for the packages that changed.

## Out of scope

- `bench.yml`, `evals.yml` and the docs deploys, which already have their own triggers.
- Self-hosted runners, an outward cost the owner has not taken.
