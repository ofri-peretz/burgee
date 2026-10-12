---
id: B-20261012-runtime-ratio-gate-noise
section: B
status: closed
source: 'B5 failures on #1043 and #1070, 2026-10-12'
recommendation: 'confirm a reading over its ceiling with more fresh processes and gate the median of every paired ratio; never raise the ceiling'
---

**B5 failed two PRs that could not have moved the pair it measured.** Both failures came on
2026-10-12, in the `B2 cold start · B3 compatibility · B4 weight` job, while GitHub Actions was
saturated (about 6 concurrent jobs for the account, with 60–110 runs queued):

- `bellpull ÷ tinyexec runtime-ratio: 1.002 is above its ceiling of 1`, on #1043. #1043 is the
  agent-skill PR and touches no bellpull code.
- `roundel/chalk ÷ chalk runtime-ratio: 1.399 is above its ceiling of 1.35`, on #1070. #1070
  is docs-only and changes two Markdown files.

The gate already interleaves ours and the incumbent round by round and takes the median of the
per-round ratios. Its verdict, though, was **one process's** median. Load that lands on a whole
process lands on every round in that process, and the median cannot outvote it.

**The noise floor with that method.** These are 20 runs of the gate's own
`sample()` + `runtimeRecord()` on unchanged main (1e7e59b), on a 4-core Linux sandbox with
Node 24.13.0:

| pair | ceiling | median | p90 | max | single readings over the ceiling |
| :-- | --: | --: | --: | --: | --: |
| `roundel/chalk ÷ chalk`, idle | 1.35 | 1.219 | 1.273 | 1.335 | 0 / 20 |
| `roundel/chalk ÷ chalk`, 6 busy loops on 4 cores | 1.35 | 1.228 | 1.307 | **1.483** | **1 / 20** |
| `bellpull ÷ tinyexec`, idle | 1.0 | 0.995 | 1.024 | 1.026 | **6 / 20** |

Under load, roundel/chalk's spread reaches past its ceiling, as #1070's 1.399 did. The pair's
own median, 1.22, sits 10 % under that ceiling. bellpull's median is within 0.5 % of its bar,
so one reading fails about every third run on an idle machine.

**Closed by** D-20261012-runtime-ratio-gate-median. A first reading over its ceiling now buys
two more fresh processes, and the verdict is the median of every paired ratio from all three.
**Still open as a finding, not a gate defect:** bellpull runs at parity with tinyexec here
(pooled median about 0.99). On unchanged main the confirmed verdict still read 1.009 and 1.006
in 2 of 20 runs. The pair is at its bar, not over it, and no affordable sample size separates
parity from a 1 % regression. The ceiling is not raised. The answer D-20260930-bellpull-spawn-vs-tinyexec
gives still stands: make bellpull measurably faster than tinyexec.
