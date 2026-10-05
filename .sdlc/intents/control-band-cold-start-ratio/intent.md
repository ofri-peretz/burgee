# Intent — B2 — cold start of `burgee/commander` over cold start of commander itself, median of paired spawns interleaved in one run. A ratio rather than a duration: absolute ms is a property of the runner, and a band over it would be a band over which machine picked up the job. breached its control band

> Stage 1 artifact, written automatically by `scripts/control-bands.ts`. Stage 6
> detected this; a human decides what it means.

**Status:** draft · **Opened:** 2026-09-30-1629f9b-ci · **Owner:** control-bands watcher

---

## Why now

`cold-start-ratio` tripped the **4 of 5 beyond 1σ** rule and is sitting **above**
its control band.

| | |
| :--- | :--- |
| Latest | 1.183 |
| Window mean | 1.1606 |
| σ | 0.0198 |
| Window | 20 points |
| Tier | 1σ |

B2 — cold start of `burgee/commander` over cold start of commander itself, median of paired spawns interleaved in one run. A ratio rather than a duration: absolute ms is a property of the runner, and a band over it would be a band over which machine picked up the job.

Observations in the window:

| Date | Value |
| :--- | ---: |
| 2026-09-29-3250edf-ci | 1.178 |
| 2026-09-29-bc68493-ci | 1.143 |
| 2026-09-29-ee6780b-ci | 1.156 |
| 2026-09-29-8b6b1e0-ci | 1.173 |
| 2026-09-29-1f9ad70-ci | 1.181 |
| 2026-09-29-3ae15c3-ci | 1.136 |
| 2026-09-29-44441d9-ci | 1.186 |
| 2026-09-29-6d71f26-ci | 1.157 |
| 2026-09-29-43dc05f-ci | 1.142 |
| 2026-09-29-2adfc25-ci | 1.139 |
| 2026-09-29-ea28e87-ci | 1.127 |
| 2026-09-29-3db5125-ci | 1.161 |
| 2026-09-30-b168d96-ci | 1.148 |
| 2026-09-30-d154ea0-ci | 1.151 |
| 2026-09-30-e60303c-ci | 1.135 |
| 2026-09-30-12bac9c-ci | 1.192 |
| 2026-09-30-e1b4b1b-ci | 1.158 |
| 2026-09-30-175dfc0-ci | 1.184 |
| 2026-09-30-04bdf33-ci | 1.183 |
| 2026-09-30-1629f9b-ci | 1.183 |

## What is wanted

The metric is back inside its band, and the cause is understood well enough that a
check would have caught it — or the band is wrong and this file says why, in which
case `.sdlc/bands/control-bands.json` changes and this intent records the reasoning.

## Affected users and systems

Whatever `cold-start-ratio` measures. Start from its entry in `.sdlc/bands/control-bands.json`
and the `sdlc-locks-evals-bands` design.

## Constraints

Do not widen the band to make this go away. A band widened to fit an excursion
measures nothing afterwards. If the band is genuinely wrong, say so here and change
it deliberately.

## Success criteria

- `npm run control-bands -- --check` exits 0 for `cold-start-ratio` on the next run.
- The cause is named here, and a check exists that would have gone red on it — or
  this file records why the band itself was wrong.

## Open questions

- Is this a real regression, a change in what we measure, or a change in the corpus?
- Which commit is the first one outside the band?
