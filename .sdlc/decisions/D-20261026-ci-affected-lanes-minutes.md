---
id: D-20261026-ci-affected-lanes-minutes
subject: 'Did the affected lanes (#1101) cut what the Compatibility workflow costs a pull request, and does `ci-affected-lanes` ship on that reading?'
taken: 'Yes on both. Median compat job-minutes per PR fell from 411.8 over the 20 PRs merged before #1101 to 71.1 over the 20 opened after it merged, and per run from 177.3 to 53. The bench-series PRs the after window holds more of do not explain it. R4 is built and the intent is stamped shipped. By the roadmap batch agent under the owner''s delegation (burgee-owner-delegates-tradeoffs, 2026-10-12), 2026-10-26'
date: '2026-10-26'
superseded_by: —
---

## The reading

`benchmarks/results/ci-minutes/2026-10-26.json`, written by `npx tsx scripts/ci-minutes.ts
--pivot 1101` from the Actions API. Run twice, minutes apart, with the same result. No workflow
was dispatched for it; every number is a pull request's own Compatibility runs.

| | PRs | Runs | Median per PR | Total | Per run | Median, matrix and floor only |
| :-- | --: | --: | --: | --: | --: | --: |
| Before (merged before #1101) | 20 | 68 | 411.8 | 12,056.1 | 177.3 | 356 |
| After (opened after #1101 merged) | 20 | 49 | 71.1 | 2,595.4 | 53 | 52.8 |

Job-minutes: each job's `completed_at - started_at`, every attempt, cancelled jobs included,
queue time excluded. Raw minutes, not billed minutes (no macOS multiplier, no rounding up).

## Why the number is the lanes and not something else

- **Push count.** Fewer pushes per PR would lower the per-PR figure alone. Per run it fell too,
  from 177.3 to 53 job-minutes, so the drop is in what each run does.
- **The mix.** The after window has 11 bench-series PRs (`chore/bench-series`,
  `chore/b1-series`, which change only `benchmarks/results/`), against 2 before. Those are the
  PRs #1101 was written for (#1062, #1081): after, a median of 52.8 job-minutes over 11 (range
  45.9 to 258.6), against 323.3 and 831.4 for the two before. Setting them aside on both sides, the median is still lower
  after than before (131 against 411.8, over 9 and 18 PRs); `ci-minutes.test.ts` checks that
  inequality on the file, so the claim cannot drift from the data.
- **Node 26.** #1187 (D-20261020-node-26-waits-for-lts) took the three Node 26 cells out of
  `matrix` on 2026-10-20. Every PR in the after window was merged by 2026-10-19, so none of its
  runs had fewer cells for that reason.

## The criteria, as they stand

1. A PR touching only `benchmarks/results/` runs the ratchet and the locks and no matrix or floor
   suite; one touching `packages/linegauge` runs linegauge and its dependents: `affected.test.ts`
   (R1) and `lint-workflows` rule 11 (R2, R3), since #1101.
2. `main` runs every compat job: a push to `main` selects everything (`affected.mts`, any event
   but `pull_request`). Run 40247943659 at `efc994e` ran all eleven of today's jobs: the ratchet,
   the affected step, three `matrix` cells and six `floor` cells. The intent's thirteen were the
   ratchet and twelve cells; three `matrix` cells left with D-20261020-node-26-waits-for-lts, not
   with this intent, and the affected step is the one #1101 added.
3. Published beside the 20 before: this decision and the reading it names.

## Reversal

If a later reading of the same script shows the after median at or above the before, reopen the
intent; the lanes are not paying for the risk D-20261012-ci-affected-pr-lanes accepted.
