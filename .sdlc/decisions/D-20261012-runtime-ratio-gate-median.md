---
id: D-20261012-runtime-ratio-gate-median
subject: 'B5 failed PRs that could not move their pair: how does the runtime-ratio gate reach a verdict a loaded runner cannot fake?'
taken: Taken
date: '2026-10-12'
superseded_by: —
---

**A B5 reading over its ceiling is no longer a red verdict on its own.** It now buys a confirm
round of `CONFIRM_PROCESSES` (2) more fresh processes, each with the pair's full rounds. The
verdict is then the median of every per-round ratio from all three processes, with round *i* of
ours still paired with round *i* of the incumbent (`measurePair`, `benchmarks/axes/runtime.ts`).
Load on one process is outvoted two to one. A regression shows up in every process and still
fails. A pair under its ceiling pays nothing, and no ceiling moves. The evidence is
B-20261012-runtime-ratio-gate-noise: #1043 (`bellpull` 1.002 > 1) and #1070 (`roundel/chalk`
1.399 > 1.35, a docs-only PR) both failed on a saturated runner.

**What was already in place, and why it was not enough.** The harness already interleaves the
two sides (ABAB, alternating which goes first, with a GC before each block). It already gates
the median of the per-round ratios, not one round. Those defences work against load that lands
on a round. They do not work against load that lands on a process: the median of 11 rounds that
all ran on a contended core is a contended number.

**Before and after.** These are 20 runs each on unchanged main, on a 4-core Linux sandbox with
Node 24.13.0, using the gate's own code. "Load" means 6 busy loops on the 4 cores.

| pair | ceiling | method | median | p90 | max | red verdicts |
| :-- | --: | :-- | --: | --: | --: | --: |
| `roundel/chalk`, idle | 1.35 | one process | 1.219 | 1.273 | 1.335 | 0 / 20 |
| `roundel/chalk`, idle | 1.35 | confirm round | 1.219 | 1.256 | 1.276 | 0 / 20 (no confirm round ran) |
| `roundel/chalk`, load | 1.35 | one process | 1.228 | 1.307 | 1.483 | **1 / 20** |
| `roundel/chalk`, load | 1.35 | confirm round | 1.212 | 1.265 | 1.281 | **0 / 20** (2 confirm rounds: first readings 1.53 and 1.45, verdicts 1.258 and 1.279) |
| `bellpull`, idle | 1.0 | one process | 0.995 | 1.024 | 1.026 | **6 / 20** |
| `bellpull`, idle | 1.0 | confirm round | 0.990 | 1.000 | 1.009 | **2 / 20** (8 confirm rounds) |

The idle "before" and "after" runs are separate series of the same code, so their unconfirmed
readings differ by run-to-run spread alone.

**Proven both ways.** `runtime.test.ts` drives `measurePair` on synthetic series of processes:

- One process spiked over the ceiling with the rest under it passes. Main's single-reading
  verdict fails the same series; that test, and the borderline one, were red against it.
- A genuine 10 % regression, with every pair over in every process, fails.
- A borderline series is decided by the pooled median: five of nine pairs over fails, and four
  of nine passes.
- The confirm round runs only when the first reading is over, and it is exactly two processes.

**Cost.** It is zero when every pair is under its ceiling, which is the common case: CI's series
puts every pair's mean well under its ceiling. A pair that reads over costs two more of its own
samples. On the sandbox that is about 34 s for `bellpull` (17 s a process, 31 rounds of 40
spawns a side) and about 4 s for `roundel/chalk`. The worst case, every pair over, is three times
the axis.

**Why not CPU time** (`process.cpuUsage`, as the cold-start method in
D-20261009-cold-start-bundled-entries uses)? It would change the quantity, not the noise. bellpull's
workload waits on a child process, and the parent's CPU leaves the child out, so the ratio would
be the libraries' overhead alone and a different number from the one every ceiling was derived
from. Every ratchet would then need re-deriving on a new series. The confirm round fixes the
verdict and leaves the measured quantity, and every ceiling, as they are.

**A real finding, not fixed here:** `bellpull ÷ tinyexec` sits at its bar. Its pooled median on
unchanged main is about 0.99, and the confirmed verdict was still over 1.0 in 2 of 20 runs. CI's
series since #766 reads the same: mean 0.989, max 0.998. No sample size the gate can afford
separates parity from a 1 % regression, so this pair stays occasionally red until bellpull is
measurably faster than tinyexec. D-20260930-bellpull-spawn-vs-tinyexec already says that is the
answer, and the ceiling is not raised.

**Reversal.** Set `CONFIRM_PROCESSES` to 0 in `benchmarks/axes/runtime.ts`. The tests in
`the verdict, on a series of processes` then go red, which is intended.
