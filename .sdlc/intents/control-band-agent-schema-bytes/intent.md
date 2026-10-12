# Intent — agent-headroom R7 — bytes of `--schema` on the burgee demo, the whole document an agent reads to discover the CLI. Compact by default since R1 (39,512 -> 22,964 B on the large demo, byte-identical parse); this band is what keeps a well-meaning "make the output readable" commit from giving the 42% back, because no test fails when it does. breached its control band

> Stage 1 artifact, written automatically by `scripts/control-bands.ts`. Stage 6
> detected this; a human decides what it means.

**Status:** draft · **Opened:** 2026-10-12-b45f141-ci · **Owner:** control-bands watcher

---

## Why now

`agent-schema-bytes` tripped the **4 of 5 beyond 1σ** rule and is sitting **above**
its control band.

| | |
| :--- | :--- |
| Latest | 4752 |
| Window mean | 3516.3000 |
| σ | 1108.1418 |
| Window | 20 points |
| Tier | 1σ |

agent-headroom R7 — bytes of `--schema` on the burgee demo, the whole document an agent reads to discover the CLI. Compact by default since R1 (39,512 -> 22,964 B on the large demo, byte-identical parse); this band is what keeps a well-meaning "make the output readable" commit from giving the 42% back, because no test fails when it does.

Observations in the window:

| Date | Value |
| :--- | ---: |
| 2026-10-11-45ce0ca-ci | 1678 |
| 2026-10-11-a039b16-ci | 1678 |
| 2026-10-11-a049bc2-ci | 2380 |
| 2026-10-11-079250e-ci | 2380 |
| 2026-10-11-733e5e0-ci | 2392 |
| 2026-10-11-65afee5-ci | 2392 |
| 2026-10-11-e0532b2-ci | 3235 |
| 2026-10-11-49d8e94-ci | 3235 |
| 2026-10-11-dfc49be-ci | 3235 |
| 2026-10-11-ecb0a00-ci | 3235 |
| 2026-10-11-5d13c9f-ci | 3235 |
| 2026-10-12-1492ed8-ci | 3235 |
| 2026-10-12-a2e4f98-ci | 4752 |
| 2026-10-12-d8569f5-ci | 4752 |
| 2026-10-12-eebbdd4-ci | 4752 |
| 2026-10-12-206d2a8-ci | 4752 |
| 2026-10-12-8621374-ci | 4752 |
| 2026-10-12-4345111-ci | 4752 |
| 2026-10-12-c5759df-ci | 4752 |
| 2026-10-12-b45f141-ci | 4752 |

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

- Decided 2026-10-12 → D-20261012-agent-schema-bytes-step-change: no regression and no change in the measurement or the corpus; four accepted conformance requirements (#1002, #1006, #1015, #1027) made the document carry more. Is this a real regression, a change in what we measure, or a change in the corpus?
- Decided 2026-10-12 → D-20261012-agent-schema-bytes-step-change: `a2e4f98` (#1027), `--schema` as a clispec v0.3 document, 3,235 → 4,752 B; nothing after it moved the value. Which commit is the first one outside the band?
