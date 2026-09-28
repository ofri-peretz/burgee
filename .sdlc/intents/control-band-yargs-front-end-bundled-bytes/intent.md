# Intent — B4 — the same measurement for `burgee/yargs`, the front-end that replaces yargs. breached its control band

> Stage 1 artifact, written automatically by `scripts/control-bands.ts`. Stage 6
> detected this; a human decides what it means.

**Status:** draft · **Opened:** 2026-09-27-7b694f7-ci · **Owner:** control-bands watcher

---

## Why now

`yargs-front-end-bundled-bytes` tripped the **8 consecutive on one side of the mean** rule and is sitting **above**
its control band.

| | |
| :--- | :--- |
| Latest | 106824 |
| Window mean | 106796.8000 |
| σ | 137.2310 |
| Window | 20 points |
| Tier | 1σ |

B4 — the same measurement for `burgee/yargs`, the front-end that replaces yargs.

Observations in the window:

| Date | Value |
| :--- | ---: |
| 2026-09-24-525d88b-ci | 106523 |
| 2026-09-24-7bd07e1-ci | 106523 |
| 2026-09-24-a216eaa-ci | 106523 |
| 2026-09-24-feb7ae2-ci | 106523 |
| 2026-09-24-073037a-ci | 106868 |
| 2026-09-24-663ddd0-ci | 106868 |
| 2026-09-25-14c1ffd-ci | 106868 |
| 2026-09-25-703d46d-ci | 106868 |
| 2026-09-25-60c4603-ci | 106868 |
| 2026-09-25-82845fb-ci | 106868 |
| 2026-09-25-d7d9e75-ci | 106868 |
| 2026-09-25-0e7b1e8-ci | 106868 |
| 2026-09-25-f1496a7-ci | 106868 |
| 2026-09-25-0bcc1d8-ci | 106868 |
| 2026-09-27-f539425-ci | 106868 |
| 2026-09-27-77dd147-ci | 106868 |
| 2026-09-27-1d099d3-ci | 106868 |
| 2026-09-27-c6d353a-ci | 106868 |
| 2026-09-27-733dde9-ci | 106868 |
| 2026-09-27-7b694f7-ci | 106824 |

## What is wanted

The metric is back inside its band, and the cause is understood well enough that a
check would have caught it — or the band is wrong and this file says why, in which
case `.sdlc/bands/control-bands.json` changes and this intent records the reasoning.

## Affected users and systems

Whatever `yargs-front-end-bundled-bytes` measures. Start from its entry in `.sdlc/bands/control-bands.json`
and the `sdlc-locks-evals-bands` design.

## Constraints

Do not widen the band to make this go away. A band widened to fit an excursion
measures nothing afterwards. If the band is genuinely wrong, say so here and change
it deliberately.

## Success criteria

- `npm run control-bands -- --check` exits 0 for `yargs-front-end-bundled-bytes` on the next run.
- The cause is named here, and a check exists that would have gone red on it — or
  this file records why the band itself was wrong.

## Open questions

- Decided 2026-09-27 → D-161: neither a regression nor a measurement or corpus change — a deliberate step, +345 B from #582's `.burgee({ floor: true })` (D-121), priced in that commit. Is this a real regression, a change in what we measure, or a change in the corpus?
- Decided 2026-09-27 → D-161: `120ba7b` (#582); the first observation carrying it is `2026-09-24-073037a-ci`. Which commit is the first one outside the band?
