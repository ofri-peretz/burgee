# Intent — a pull request runs what it can have changed; `main` runs everything

> Stage 1 artifact. Opened from the wave-4 ranking
> ([`next-wave-4-2026-10.md`](../../research/next-wave-4-2026-10.md)). The account runs about six
> GitHub Actions jobs at a time, and every pull request asks for the full matrix.

**Status:** shipped · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz · **Shipped:** 2026-10-26 — criteria 1–2 by R1–R3 (#1101: `affected.test.ts`, `lint-workflows` rule 11; `main`'s run 40247943659 at `efc994e` ran every job); criterion 3 by `benchmarks/results/ci-minutes/2026-10-26.json`, median compat job-minutes per PR 411.8 before and 71.1 after, held by `ci-minutes.test.ts` and published in D-20261026-ci-affected-lanes-minutes

---

## What is wanted

On a pull request, `compat.yml`'s `matrix` and `floor` cells and `quality-full.yml`'s `test` job
run only the affected packages (each changed package and each package that depends on one), and
a PR that changes no package runs none of those cells. The compat ratchet and the repository's
own locks still run in full on every PR. `main`, the merge queue, the weekly scan and a
`run-full-ci` label run the full matrix, unchanged.

## Why now

- **The queue.** Of the last 30 completed Compatibility runs (2026-10-12, 20:03Z to 23:29Z), 24
  were cancelled and 6 succeeded. The six that succeeded, all pull requests, took 43 to 79 minutes wall clock
  (`run_started_at` to `updated_at`), most of it queued.
- **Every PR asks for the same 13 compat jobs**: one ratchet, six `matrix` cells (three OSes ×
  Node 24, 26), six `floor` cells (three OSes × 20.19.0, 22.13.0), each building every package and
  (in `matrix`) every docs app, then every suite. #1062 and #1081 change only files under
  `benchmarks/results/` and ran all 13, several times each.
- **The pattern already works here.** `quality-full.yml`'s `coverage` job has run affected-only
  since 2026-09-30, with the base computed by turbo's `...[base]`.
- **Decided.** D-20261012-ci-affected-pr-lanes.

## Affected users and systems

- `.github/workflows/compat.yml`, `.github/workflows/quality-full.yml`,
  `scripts/lint-workflows.ts`, and a shared script that prints the affected set.
- Every contributor's wait time; no published package.

## Constraints

- **Required checks keep reporting.** A cell with nothing to run reports success, never skipped
  in a way that blocks a required context.
- **Full on `main`.** Post-merge verification and the broken-main reporter are unchanged.
- **A root change is a full change.** Workflows, root configs, `package-lock.json`, `scripts/`,
  `vitest*.config.ts` and `turbo.json` select every package.

## Success criteria

1. A PR touching only `benchmarks/results/` runs the ratchet and the locks and no matrix or floor
   suite; a PR touching `packages/linegauge` runs linegauge and its dependents.
2. `main` runs all 13 compat jobs as today.
3. Compat minutes per PR, summed over the next 20 PRs, are published beside the 20 before.

## Jev triage

| user_impact | incumbent_gap | risk_reduced | composite | ready_for_spec | needs_model |
| --: | --: | --: | --: | :-- | :-- |
| 0 | 0 | 2? | 4 | yes | no |

## Open questions

- Whether a PR may skip suites at all. **Decided 2026-10-12**, D-20261012-ci-affected-pr-lanes.
