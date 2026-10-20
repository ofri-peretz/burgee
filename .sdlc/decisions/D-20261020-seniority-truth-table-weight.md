---
id: D-20261020-seniority-truth-table-weight
subject: 'seniority''s truth table (R1, criterion 2) and per-key provenance through an `extends` chain (R3, R7) add 1,217 B to the built package, which puts `shape.test.ts`''s R9 ceiling (140,600 B) and `./dotenv/cli`''s entry budget (29,800 B) over by 1,158 B and 56 B. Where does the table live, and do the budgets move?'
taken: Taken
date: '2026-10-20'
superseded_by: —
---

**The truth table is exported from the root, `seniority`, and not from `seniority/precedence`. Three budgets move, and nothing else does.** R9's ceiling is now 142,000 B (from 140,600 B). `./dotenv/cli`'s budget is now 30,000 B (from 29,800 B). burgee's core bundled-bytes ceiling in `benchmarks/axes/weight.ts` is now 24,560 B (from 24,500 B).

**Where it lives.** burgee imports `seniority/precedence` on every program's start-up path, and that path is the one with a few bytes of headroom (`packages/burgee/src/weight.test.ts`). The table is for a reader: a test, a docs page, a tool reading the order. It is not for a resolver. So `src/truth-table.ts` is its own module and only the root re-exports it. burgee's `weight.test.ts` passes unchanged (64 / 64), so no burgee budget moves.

**What the bytes are** (clean builds of main `de2209f813` and of this branch, `tsc` output after `strip-comments`):

| file | main | branch | delta | what for |
| :-- | --: | --: | --: | :-- |
| `truth-table.js` | — | 582 | +582 | `truthTable(order)` and the frozen `TRUTH_TABLE` |
| `config.js` | 4,500 | 5,018 | +518 | `origins`: the file in an `extends` chain that set each key, and its line |
| `index.js` | 929 | 989 | +60 | the root re-export |
| `precedence.js` | 3,790 | 3,847 | +57 | `fromLayer` reads `origins` |
| **dist** | **140,541** | **141,758** | **+1,217** | |

**burgee's core bundle** is the one burgee number that moves: 24,431 → 24,474 B locally (+43 B, minified). That is `fromLayer` reading `origins`, and it is on the start-up path because `resolve` runs on every invocation. CI's runners read about 32 B more than a local build (see the ceiling's own history), so 24,500 would not cover ~24,506. The new 24,560 does, with room for that 32 B. `burgee ÷ cac` reads 2.342 locally and about 2.345 on CI, under its 2.35 claim ratchet, which is not raised. burgee's own `weight.test.ts` budgets all pass unchanged. The table lives at the root so that this 43 B is the only part of the change on that path.

`./dotenv/cli` moves only because `dotenv.js` reaches `load.js`, which reaches `precedence.js`. It stood at 29,799 B, 1 B under its budget, so the 57 B in `fromLayer` put it at 29,856 B. The new budget has 144 B of headroom. `./precedence` (4,000 B) and `./config` (13,000 B) stay inside their budgets.

**Why it is worth it.** The table is criterion 2 of the intent, and its own text says the table is the product. The 518 B fix a provenance record that named the wrong file. Before it, a value set only in a parent config was cited at the child, which does not contain the value. Answering *which source set this value* correctly is the reason the package exists. The ceiling's own comment says what it is for: catching a dependency or a bundled parser, which would move the number by an order of magnitude. 1.2 KB of the package's own code does not look like that, and the table above accounts for every byte of it.

**The band.** `npm run weight:converge` re-measured `layers.seniority.ours` in `.sdlc/bands/foundation-ceilings.json` (218,298 → 221,429 B installed, ratio 0.1107 → 0.1123), because the package carries the new code and the README now lists the table too.
