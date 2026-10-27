---
id: B-20261027-closeout-signal-exit-starts-slower
section: B
status: open
source: closeout criterion 3, the optional `signal-exit` spawn row (D-20261027-linegauge-closeout-spawn-bars)
recommendation: 'Keep `closeout/signal-exit − signal-exit` gated at +2 ms (`CLOSEOUT_SIGNAL_EXIT_SPAWN` in `benchmarks/axes/perf.ts`) so it cannot grow. Then look at the module graph: the entry loads `signal-exit.js`, `signal-exit-core.js`, `signal-list.js` and `ambient.js`, four ES modules against signal-exit''s two. Lower the gate toward 0 as the measured difference falls'
---

`closeout/signal-exit` starts slower than signal-exit 4.1.0 on every reading so far. The paired
median over the same import and one registered no-op handler:

| where | reading |
| :-- | --: |
| CI, run 40499538893 attempt 1 (published) | +0.62 ms |
| CI, run 40499538893 attempt 2 | +0.38 ms |
| M4 Pro, three local runs, 2026-10-27 | +1.22, +1.06, +0.99 ms |

The cause is the module graph, as it was for `seniority/dotenv` (B-20261026-seniority-dotenv-starts-slower):
every ES module costs a resolve, a compile and a link, whatever its size, and the bundled bytes say
the opposite (0.93 of signal-exit). `closeout/exit-hook`, two modules against exit-hook's one, reads
−0.65 and −0.31 ms on CI and +0.40 to +0.66 ms locally.

No criterion rests on this row. closeout R8 names `exit-hook` as the bar and calls `signal-exit` a
free pass, and the row was added so the drop-in with the largest install base is measured whichever
way it reads. This gap closes when three CI readings in a row are at or under 0.
