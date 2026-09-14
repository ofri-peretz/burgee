# Intent — B4 — the same measurement for `burgee/commander`, the front-end that replaces commander. breached its control band

> Stage 1 artifact, written automatically by `scripts/control-bands.ts`. Stage 6
> detected this; a human decides what it means.

**Status:** draft · **Opened:** 2026-09-14-fac0f48 · **Owner:** control-bands watcher

---

## Why now

`commander-front-end-bundled-bytes` tripped the **8 consecutive on one side of the mean** rule and is sitting **above**
its control band.

| | |
| :--- | :--- |
| Latest | 58923 |
| Window mean | 58881.4000 |
| σ | 83.2000 |
| Window | 20 points |
| Tier | 1σ |

B4 — the same measurement for `burgee/commander`, the front-end that replaces commander.

Observations in the window:

| Date | Value |
| :--- | ---: |
| 2026-09-13-ea58e63 | 58715 |
| 2026-09-13-ebbbc49 | 58715 |
| 2026-09-13-ecedfa2 | 58715 |
| 2026-09-13-efc00b5 | 58715 |
| 2026-09-14-0750ebc | 58923 |
| 2026-09-14-127e08d | 58923 |
| 2026-09-14-1a49c60 | 58923 |
| 2026-09-14-27f936f | 58923 |
| 2026-09-14-3f92a60 | 58923 |
| 2026-09-14-42e00e5 | 58923 |
| 2026-09-14-50cc1a3 | 58923 |
| 2026-09-14-5816319 | 58923 |
| 2026-09-14-5c42525 | 58923 |
| 2026-09-14-5cb5ca1 | 58923 |
| 2026-09-14-624c72d | 58923 |
| 2026-09-14-72079f3 | 58923 |
| 2026-09-14-862e837 | 58923 |
| 2026-09-14-96456fd | 58923 |
| 2026-09-14-b68c1c1 | 58923 |
| 2026-09-14-fac0f48 | 58923 |

## What is wanted

The metric is back inside its band, and the cause is understood well enough that a
check would have caught it — or the band is wrong and this file says why, in which
case `.sdlc/bands/control-bands.json` changes and this intent records the reasoning.

## Affected users and systems

Whatever `commander-front-end-bundled-bytes` measures. Start from its entry in `.sdlc/bands/control-bands.json`
and the `sdlc-locks-evals-bands` design.

## Constraints

Do not widen the band to make this go away. A band widened to fit an excursion
measures nothing afterwards. If the band is genuinely wrong, say so here and change
it deliberately.

## Success criteria

- `npm run control-bands -- --check` exits 0 for `commander-front-end-bundled-bytes` on the next run.
- The cause is named here, and a check exists that would have gone red on it — or
  this file records why the band itself was wrong.

## Open questions

- Is this a real regression, a change in what we measure, or a change in the corpus?
- Which commit is the first one outside the band?
