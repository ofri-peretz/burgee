---
id: B-20261112-burgee-yargs-b5-runtime-over-ceiling
section: B
status: closed
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

**Closed 2026-11-14.** The step is #1407 (`b3aaede3`, *parse-command stays linear on a long run
of dots*), and the fix takes parse-command off the per-call path altogether rather than undoing
the linear-time guarantee #1407 bought.

**Why it cost time.** Every builder method checks its arguments with
`argsert('<string> [object]', …)`, and the yargs port parsed that literal with parse-command on
every call: the B5 program's one `parseSync()` runs it 70 times. #1407 replaced parse-command's
quadratic regexes with linear helpers, and `stripBrackets` became a regex `split` plus a `map`
closure per word where it had been a character loop, with a `Uint8Array` per call in
`splitOutsideBrackets` (`String.prototype.split` calls per parse: 145 before, 334 after). In a fresh
process, which is what B5 times, that is about 6% of `burgee/yargs`' parse. A one-process A/B that
loads every build together does not see it (every build 1.05–1.15 on the same runners), which is why
the laptop measurement above pointed the right way without resolving it.

**The bisect**, run on GitHub's x64 runners (a push-triggered scratch workflow, three jobs: two
Intel Xeon 6975P-C, one AMD EPYC 9V74; deleted afterwards). Each commit's `burgee` and its five
workspace dependencies were built from that commit, then timed by B5's own harness
(`fixtures/runtime/harness.mjs`, 11 rounds, fresh process per reading) against the same yargs,
five processes per commit per runner, interleaved across commits. Median and range of the 15
per-process medians:

| Commit | What | Median | Range |
| :-- | :-- | --: | :-- |
| `4c336da3` | last nightly pass, 2026-10-27 | 1.068 | 1.041–1.083 |
| `7d69edd5` | last push run, 2026-11-01 | 1.066 | 1.054–1.099 |
| `24c4a09c` | #1407's parent | 1.068 | 1.042–1.090 |
| `b3aaede3` | **#1407** | **1.127** | 1.117–1.152 |
| `a6b9f9ae` | first red nightly | 1.127 | 1.118–1.158 |
| `f52e164e` | main, 2026-11-13 | 1.123 | 1.093–1.151 |
| fix | main + `argsert` parses once | **0.820** | 0.810–0.847 |

The CI series agreed before the bisect ran: every push run through `7d69edd5` (2026-11-01) read
1.04–1.096, and #1403 moved B5 to the nightly schedule the same day, so the first run after #1407
was the 2026-11-02 nightly. The ARM laptop (M4 Pro, load 15–19) could not resolve the step in
fresh processes (per-process spread 0.7–1.9), but it agrees on the fix: main 1.055 (0.945–1.119),
fix 0.923 (0.850–1.028), nine interleaved B5 processes each.

**The fix.** `argsert` parses each usage string once (`usageOf` in `packages/burgee/src/yargs/utils.ts`),
frozen and capped at 256 entries. parse-command itself keeps #1407's linear helpers, so
`utils.test.ts`' growth locks still hold. yargs' suite grades the façade 816 / 816 and yargs 17's
793 / 794, both unchanged against the baseline.

**The guard.** `packages/burgee/src/yargs/argsert-usage.test.ts` counts parse-command's tokeniser
over a second build and `parseSync()` of the B5 program and requires zero. On `f52e164e` it fails:
`expected 70 to be +0`. It counts the work, not the clock.

The ceiling stays at 1.1. The ratchet is lowered from the nightly series by
`npm run ratchets:propose` once enough runs carry the fix.
