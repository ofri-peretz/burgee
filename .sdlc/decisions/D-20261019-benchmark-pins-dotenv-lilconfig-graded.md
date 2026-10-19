---
id: D-20261019-benchmark-pins-dotenv-lilconfig-graded
subject: 'B4 weighs `seniority/dotenv` and `seniority/lilconfig` against dotenv 18.0.8 and lilconfig 3.1.4, the releases compat-oracle grades'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets and trade-offs'
date: '2026-10-19'
superseded_by: —
---

**`benchmarks/package.json` pins dotenv 18.0.8 and lilconfig 3.1.4. Two ratios move, both down:
`lighter-than-dotenv` 0.520 -> 0.516 and `lighter-than-lilconfig` 0.615 -> 0.612. No ceiling moves.**

PR #1138 re-vendored both suites (D-20261019-revendor-execa-dotenv-lilconfig) and left the benchmark
pins on 18.0.7 and 3.1.3. From then on each façade was graded against one release and weighed
against another. `scripts/pinned-incumbent-lock.test.ts` now fails a pin that no oracle suite
installs. On `main` it read `dotenv 18.0.7, graded at 18.0.8 or 17.4.2` and
`lilconfig 3.1.3, graded at 3.1.4`.

## Measured

`npm run bench -- --axis weight --check` on `9930e086` plus this change, against CI's
`2026-10-19-66e4611-ci.json` before it:

| pair | ours | incumbent before | incumbent now | ratio before | ratio now |
| :-- | --: | --: | --: | --: | --: |
| `seniority/dotenv` ÷ dotenv | 5,966 | 11,481 (18.0.7) | 11,570 (18.0.8) | 0.520 | 0.516 |
| `seniority/lilconfig` ÷ lilconfig | 3,286 | 5,343 (3.1.3) | 5,365 (3.1.4) | 0.615 | 0.612 |

Our side did not move with the pin: CI and this run read the same 5,966 and 3,286 B. The incumbents
grew by 89 and 22 B: 18.0.8's scanner handles U+2028 and U+2029, and 3.1.4 drops a BOM.

## What does not move

- The ratio gates stay at U5's 1. Both pairs are well under it.
- The byte ceilings in `benchmarks/axes/weight.ts` stay at 6,000 and 3,350. `seniority/dotenv`
  holds 34 B of headroom over CI's reading, and that is noted beside the ceiling. It is not
  raised, because nothing here grew our side.
- No control band reads these pairs.
