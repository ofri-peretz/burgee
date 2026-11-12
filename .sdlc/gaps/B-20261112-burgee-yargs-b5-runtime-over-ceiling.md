---
id: B-20261112-burgee-yargs-b5-runtime-over-ceiling
section: B
status: open
source: 'burgee#1440, the nightly `Benchmarks` run (bench.yml, schedule): every scheduled run since 2026-11-02 that measured B5 failed on one gate, most recently run 43002142648 on 1350444030'
recommendation: 'Bisect the yargs-front-end changes between 4c336da3 and a6b9f9ae on a quiet runner (a `workflow_dispatch` of bench.yml per candidate, or a cloud routine), not on a loaded laptop. The candidates are #1311, #1325, #1361, #1362 and #1407, which touch `yargs/factory.ts`, `y18n.ts`, `shim.ts` and `utils.ts`. If one of them costs the ~6%, take it back out of the `parseSync()` path. Only if the cost is the price of a fix that must stay, raise the ceiling with a decision that names it. Done when the nightly B5 gate is green twice in a row'
---

`burgee/yargs ÷ yargs` B5 runtime ratio is over its downward-only ceiling of 1.1
(`.sdlc/bands/runtime-ratchets.json`), and it is the only gate the nightly cheap-axes step
fails on.

| Run | Date | Commit | Ratio |
| :-- | :-- | :-- | --: |
| 40492593210 | 2026-10-27 | `4c336da3` | 1.063 (pass) |
| 41429158007 | 2026-11-02 | `a6b9f9ae` | 1.119 |
| 42360344451 | 2026-11-07 | `3e69fb2d` | 1.146 |
| 42468861621 | 2026-11-08 | `5054fb72` | 1.150 |
| 42604371514 | 2026-11-09 | `f78decf5` | 1.148 |
| 42801693002 | 2026-11-10 | `13504440` | 1.138 |
| 43002142648 | 2026-11-11 | `13504440` | 1.122 |

The ceiling was derived from 48 CI runs: mean 1.061, sd 0.013, max 1.092. Every run since
2026-11-02 sits 4 to 7 sd above that mean, so this is a step, not noise. The yargs incumbent's
own tree did not move between the two commits: no `yargs`, `yargs-parser`, `y18n`, `cliui`,
`escalade` or `get-caller-file` version changed in the lockfile. So the step is on burgee's side.

Measured on 2026-11-12 on a laptop at load 80–150, HEAD's `burgee/yargs` source against
`4c336da3`'s, in one process with interleaved CPU time over the B5 workload: 1.027 and 1.063
(medians of 41 rounds, IQR about ±0.06). That points the same way, but it is too noisy to
bisect on. It is recorded here instead of guessed at, and the ceiling is not raised: a
downward-only ratchet is raised only by a decision that names what the cost buys.
