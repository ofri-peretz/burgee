---
id: D-20261026-seniority-spawn-bars
subject: 'seniority criterion 4 needs a spawn-delta row under lilconfig and the discovery-chain row, and R3 needs a line for the `package.json` field. Where do the new perf gates sit, and do the package budgets move for the line scan?'
taken: Taken
date: '2026-10-26'
superseded_by: —
---

**The two spawn rows are gated as paired differences, with an allowance over R9's bar rather than on it. The discovery-chain row is gated at U5's 1 on all three ratios. Three seniority budgets move for R3, and nothing else does.**

**`seniority/lilconfig − lilconfig`: gate +2 ms.** R9 writes the bar as "spawn delta at or under `lilconfig`", which is a median paired difference of 0 ms or less. Measured on 2026-10-26 on an M4 Pro under a load average of 30 to 40: −0.19 ms over 68 interleaved rounds (`npm run bench -- --axis perf`), and −0.72 ms over 40 more in a separate run. The two spawns are near equal: four ES modules against one CommonJS file, both well under a millisecond above each other. A gate at exactly 0 would therefore turn red on a runner's bad minute, which is the failure #27 records for an absolute gate. 2 ms is the allowance: a fifth of roundel R8's 10 ms, because R9 asks for parity and R8 allows a cost. The row's median is published on `/docs/benchmarks` (the new *Difference* table), so a reader sees whether the bar itself is met, not just the gate.

**`seniority/dotenv − dotenv`: gate +10 ms, a ratchet.** R9 names lilconfig only, so the `.env` drop-in has no time bar of its own. It is measured anyway, because a suite that only timed the row it wins would be lying by selection. It is the slower one: +1.74 ms and +4.88 ms in two runs, six ES modules against dotenv's one file. It takes roundel R8's allowance so it cannot grow, and the gap is recorded as B-20261026-seniority-dotenv-starts-slower.

**`ROUNDS` goes from 52 to 68.** The four rows make seventeen variants, and the rotation needs a whole number of turns per starting position (`perf.test.ts`). 68 is four turns each, as 52 was for thirteen. That is about 30% more spawns on the perf axis, most of them `ink + react` at ~340 ms. The alternative was to drop the dotenv pair, which is the selection the paragraph above rules out.

**The discovery-chain row.** `seniority/cosmiconfig + seniority/find-up` against `cosmiconfig + find-up` at the graded releases (10.0.1 and 8.0.0; find-up 8.0.0 is added to `benchmarks`' devDependencies, pinned and ignored by dependabot like the other graded incumbents). It is gated on bundled bytes (ceiling 13,000 B: 12,877 measured plus the 80 B CI margin, rounded up to the next fifty), on the bundled ratio (0.154) and on the installed tree in packages (1 against 10) and bytes (224,506 against 1,892,988, 0.119). All three ratios are under 1, so each gate is U5's 1. The intent counted seven packages at cosmiconfig 9 and find-up 5; at the graded releases the tree is ten (cosmiconfig 10 dropped import-fresh and parse-json, find-up 8 dropped path-exists, and js-yaml, argparse, env-paths, p-limit, yocto-queue and unicorn-magic are in it). The number published is the walk's, not the intent's.

**R3's budgets.** The line scan that gives the `package.json` field its lines also had to know which level of the JSON a key sits on: the old one returned the first `"out":` in the file, so a nested key written above the top-level one was cited at the wrong line. `config.js` grows by 1,831 B and `index.js` by 14 B (unminified `tsc` output; clean builds of main `bcc075fff7` and this branch).

| budget | was | main → branch | now |
| :-- | --: | --: | --: |
| `shape.test.ts` R9 ceiling (whole `dist`) | 142,000 | 141,732 → 143,577 | 144,000 |
| `weight.test.ts` `./config` | 13,000 | 12,895 → 14,726 | 14,900 |
| `weight.test.ts` `.` | 45,000 | 44,195 → 46,040 | 46,400 |

burgee's core bundle does not move: `config-layers.ts` reaches `seniority/config` through `await import()`, only for a program that declares `config`. `npm run weight:converge` re-measured `layers.seniority.ours` (222,055 → 224,506 B installed).

**Why it is worth it.** A line number in provenance is the reason the package exists, and a wrong one is worse than none (R12). The bytes buy a correct line where one was wrong and a line where there was none.
