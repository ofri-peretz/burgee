# Design — a pull request runs what it can have changed; `main` runs everything

Intent: [`intent.md`](./intent.md). **Status:** review.

---

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
  compat job-minutes per PR from the Actions API, published in a decision. *Check:* the file
  exists and its "after" median is below "before"; on main there is no file.

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
| R4 | `benchmarks/results/ci-minutes/` and its decision | no reading |

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
