---
id: D-20261020-closeout-drop-in-budgets
subject: 'closeout-at-incumbent-weight: where do the closeout drop-ins'' weight budgets and ratchets move to?'
taken: 'Taken — by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-20'
date: '2026-10-20'
superseded_by: —
---

**Every bundled-weight gate on the two drop-ins moves down, and one unminified budget moves up
by 300 B.** All measured on the branch of closeout-at-incumbent-weight, and each ceiling is the
measurement plus the 80 B CI margin, rounded up to the next fifty, as everywhere in
`benchmarks/axes/weight.ts`.

| gate | was | now | measured |
| :-- | --: | --: | --: |
| `BUNDLED_CEILING['closeout/exit-hook']` | 4,900 | 1,700 | 1,579 |
| `BUNDLED_CEILING['closeout/signal-exit']` | 3,750 | 2,800 | 2,656 |
| `RATIO_CEILING['closeout/exit-hook']` | 2.98 | 1 | 0.960 |
| `RATIO_CEILING['closeout/signal-exit']` | 1.31 | 1 | 0.930 |
| `weight.test.ts` `./exit-hook` budget | 13,000 | 3,800 | 3,717 |
| `weight.test.ts` `./signal-exit` budget (now the `import` door) | 5,500 | 4,900 | 4,837 |
| `weight.test.ts` `./signal-exit` `require` door (new) | — | 5,500 | 5,128 |
| `weight.test.ts` `./signal-exit/signals` budget | 500 | **800** | 770 |

**The one raise.** `./signal-exit/signals` reads 770 B (was 381) because the platform list moved to
`signal-list.ts`, so both doors of `./signal-exit` and this entry read one copy. The CommonJS file
now `require()`s it, and the list reads the platform through `ambient.js`, closeout's one door to
the process (R7). The old `.cts` read `globalThis.process` itself, which
`process-reference-lock.test.ts` refuses in a `.ts` file. The other option was two copies of the list and a lock to keep them equal,
which saves about 390 B of unminified, never-bundled bytes on an entry with no B4 row and adds a
way for the copies to drift. One copy is worth 300 B of budget.

**The band.** `.sdlc/bands/foundation-ceilings.json` closeout `ours` 107,842 → 108,896 B
installed (ratio 0.5867 → 0.5925, ceiling unchanged), from `npm run weight:converge`. The package
ships two more modules (`signal-exit-core.js`, `signal-list.js`), the ES door and their
declarations. `exit-hook.js` is smaller. The installed tarball is not what a user's bundle grows
by, and that number fell on both drop-ins.

**Gaps closed.** B-20261012-closeout-bundles-heavier-than-exit-hook and
B-20261012-closeout-heavier-than-signal-exit asked for exactly this, and close with the ratio
rows at 1.
