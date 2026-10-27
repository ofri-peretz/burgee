---
id: D-20261027-linegauge-closeout-spawn-bars
subject: 'linegauge criterion 2 and closeout criterion 3 each need a gated spawn-delta row (D-20261026-library-spawn-delta-rows). Where does each gate sit, and is the signal-exit row added?'
taken: 'Taken by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-27'
date: '2026-10-27'
superseded_by: —
---

**Three `perf` rows, each the median paired difference over the incumbent a user removes, at the
release compat-oracle grades. `linegauge − string-width` is gated at 0 ms, the bar itself.
`closeout/exit-hook − exit-hook` and `closeout/signal-exit − signal-exit` are gated at +2 ms,
seniority R9's allowance over a bar of 0.** The shape is seniority R9's
([D-20261026-seniority-spawn-bars](./D-20261026-seniority-spawn-bars.md)): a variant for the
incumbent, a variant for ours with `over` and `bar`, and a `cold-start-delta-ms` record that the
page prints in its *Difference* table.

**What each row spawns.** The width rows import the default and measure `'ada'`; the exit rows
import the entry and register one no-op hook. Each prints the floor's line only when its call
worked, so a fixture that stopped loading fails the run instead of timing nothing. The two sides of
a pair make the same call.

## Measured

`npm run bench -- --axis perf` on an M4 Pro, load average 8 to 30, three runs of 92 interleaved
rounds on `4c336da` plus this change:

| row | run 1 | run 2 | run 3 | median |
| :-- | --: | --: | --: | --: |
| `linegauge − string-width` | −15.63 | −15.86 | −15.21 | −15.63 ms |
| `closeout/exit-hook − exit-hook` | +0.66 | +0.40 | +0.59 | +0.59 ms |
| `closeout/signal-exit − signal-exit` | +1.22 | +1.06 | +0.99 | +1.06 ms |

With every gate at 0, the first run exited 1 on both closeout rows and 0 on linegauge's
(`benchmarks/ratchet.test.ts` holds each gate red one step past it). The CI reading is recorded
below under *CI*.

## The gates

- **linegauge at 0, no allowance.** The allowance exists for two near-equal spawns whose paired
  median crosses zero on a runner's bad minute. These two are 15 ms apart: string-width 8.3.0
  builds an `Intl.Segmenter` at import across three packages, and linegauge builds its segmenter
  on first use (`packages/linegauge/src/style.ts`), which an ASCII string never reaches. A gate at
  the bar keeps 15 ms of headroom and still fails the day linegauge's start-up stops being the
  lighter one.
- **closeout at +2 ms.** Both drop-ins load two ES modules (the entry and `ambient.js`, the one
  file R7 lets touch `process`) against the incumbent's one file. They are near equal, and on this
  machine the paired median is above 0 by about half a millisecond. 2 ms is seniority R9's
  allowance, for the same reason it was taken there. The gate is not the bar: the page prints the
  median, and the umbrella is stamped against the bar, not the gate.
- **The `signal-exit` row is added.** The 2026-10-26 decision made it optional because the
  criterion names only exit-hook. It is added because `closeout/signal-exit` is the drop-in with
  the largest install base behind it, and it is measured whichever way it reads.
- **`get-east-asian-width` is not timed.** D-20261026-library-spawn-delta-rows asked for it to be
  reported beside string-width as the harder target. It is not a declared benchmark dependency, and
  pinning it would mean an exact pin in `benchmarks/package.json` and a `dependabot.yml` ignore
  entry (`scripts/pinned-incumbent-lock.test.ts`), which is a `.github/` change for a row no
  criterion asks for. The criterion's bar is string-width, and that row exists.

**`ROUNDS` goes from 68 to 92.** Six variants make twenty-three, and 92 keeps four turns per
starting position (`perf.test.ts`). About 35% more spawns on the perf axis; the six new fixtures
each spawn in about 30 ms, and the cost is mostly the extra rounds of `ink + react`.

## CI

Pending the first `bench.yml` run of this change on a PR. Recorded in the same PR before it merges.
