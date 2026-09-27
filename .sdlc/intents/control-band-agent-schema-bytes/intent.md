# Intent — agent-headroom R7 — bytes of `--schema` on the burgee demo, the whole document an agent reads to discover the CLI. Compact by default since R1 (39,512 -> 22,964 B on the large demo, byte-identical parse); this band is what keeps a well-meaning "make the output readable" commit from giving the 42% back, because no test fails when it does. breached its control band

> Stage 1 artifact, written automatically by `scripts/control-bands.ts`. Stage 6
> detected this; a human decides what it means.

**Status:** draft · **Opened:** 2026-09-27-f539425-ci · **Owner:** control-bands watcher

---

## Why now

`agent-schema-bytes` tripped the **8 consecutive on one side of the mean** rule and is sitting **above**
its control band.

| | |
| :--- | :--- |
| Latest | 1573 |
| Window mean | 1564.0000 |
| σ | 27.0000 |
| Window | 20 points |
| Tier | 1σ |

agent-headroom R7 — bytes of `--schema` on the burgee demo, the whole document an agent reads to discover the CLI. Compact by default since R1 (39,512 -> 22,964 B on the large demo, byte-identical parse); this band is what keeps a well-meaning "make the output readable" commit from giving the 42% back, because no test fails when it does.

Observations in the window:

| Date | Value |
| :--- | ---: |
| 2026-09-24-9c5c512-ci | 1573 |
| 2026-09-24-a216eaa-ci | 1573 |
| 2026-09-24-c938fbf-ci | 1573 |
| 2026-09-24-d5a1b02 | 1483 |
| 2026-09-24-ef512ea | 1483 |
| 2026-09-24-feb7ae2-ci | 1573 |
| 2026-09-25-0bcc1d8-ci | 1573 |
| 2026-09-25-0e7b1e8-ci | 1573 |
| 2026-09-25-14c1ffd-ci | 1573 |
| 2026-09-25-60c4603-ci | 1573 |
| 2026-09-25-703d46d-ci | 1573 |
| 2026-09-25-82845fb-ci | 1573 |
| 2026-09-25-d7d9e75-ci | 1573 |
| 2026-09-25-f1496a7-ci | 1573 |
| 2026-09-27-1d099d3-ci | 1573 |
| 2026-09-27-733dde9-ci | 1573 |
| 2026-09-27-77dd147-ci | 1573 |
| 2026-09-27-7b694f7-ci | 1573 |
| 2026-09-27-c6d353a-ci | 1573 |
| 2026-09-27-f539425-ci | 1573 |

## What is wanted

The metric is back inside its band, and the cause is understood well enough that a
check would have caught it — or the band is wrong and this file says why, in which
case `.sdlc/bands/control-bands.json` changes and this intent records the reasoning.

## Affected users and systems

Whatever `agent-schema-bytes` measures. Start from its entry in `.sdlc/bands/control-bands.json`
and the `sdlc-locks-evals-bands` design.

## Constraints

Do not widen the band to make this go away. A band widened to fit an excursion
measures nothing afterwards. If the band is genuinely wrong, say so here and change
it deliberately.

## Success criteria

- `npm run control-bands -- --check` exits 0 for `agent-schema-bytes` on the next run.
- The cause is named here, and a check exists that would have gone red on it — or
  this file records why the band itself was wrong.

## Open questions

- Is this a real regression, a change in what we measure, or a change in the corpus?
- Which commit is the first one outside the band?
