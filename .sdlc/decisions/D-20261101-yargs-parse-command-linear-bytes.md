---
id: D-20261101-yargs-parse-command-linear-bytes
subject: '`burgee/yargs` parse-command grew faster than its input on a long run of dots, and that failed `Quality (Full) Gate` on every PR. Making it linear costs bytes on every yargs entry. Do we pay them, or find a smaller fix?'
taken: 'Taken by the agent closing the gap, under the owner''s delegation of budgets and trade-offs (burgee-owner-delegates-tradeoffs), 2026-11-01'
date: '2026-11-01'
superseded_by: —
---

**We pay them: +69 B bundled on `burgee/yargs`, and +55 B on each static walk.** Each ceiling
moves with the measurement: the new reading, plus the ~32 B that CI reads heavier, rounded up to
the next 50. Every earlier `burgee/yargs` raise followed the same rule.

## What the bytes buy

`utils.test.ts › parseCommand … strips brackets after a run of dots in linear time` failed inside
the required `Quality (Full) Gate` on #1403 and #1404: 25.42x and 24.05x at 8x the input, against
a ceiling of 24. A cpu profile of 20 calls on `cmd x` plus 1,280,000 dots showed two causes:

- **44%** of the time went to `inside[i] = …`. That line fills a plain array from its last index
  down, and V8 holds such an array as a sparse dictionary.
- **18%** went to the garbage collector, collecting the rope that `stripBrackets` built one
  character at a time.

Past 1M characters, each doubling of the input cost 2.1–2.5x (exponent 1.2–1.4). The fix makes
the map a `Uint8Array` and has `stripBrackets` split at the brackets. Each doubling now costs
1.99–2.04x up to 5,120,000, and `cmd x` with 5,120,000 dots fell from 461 ms to 134 ms. The
results don't change: `utils.test.ts` still compares against upstream's regexes on every short
string, and yargs' own suite still passes 816 / 816.

## Smaller fixes, rejected

- **Only the typed array (+27 B bundled).** It still measured exponent 1.2–1.4 past 1M on
  `cmd` + dots, because the rope stays.
- **A scan that slices between brackets.** It came to about the same size as the split, and it
  measured exponent 0.88–1.14 where the split measured 0.99–1.04.
- **A lookbehind regex, `/(?<!\.)\.*[\][<>]/g`.** It would be smaller. It is linear only because
  of the lookbehind, which is the same shape CodeQL flagged in #17–#21. We do not reintroduce a
  regex a scanner reads as polynomial.

## The bytes

Both trees were measured locally on clean builds, on the same machine, with `bundledRecords` and
the static walk. Main is at `4204fb307f`.

| measure | main | this change | step | ceiling |
| :-- | --: | --: | --: | :-- |
| B4 bundled, `burgee/yargs` (`benchmarks/axes/weight.ts`) | 110,156 | 110,225 | +69 | 110,200 -> 110,300 |
| `lighter-than-yargs` (against yargs' 111,686) | 0.986 | 0.987 | | ≤ 1, unchanged |
| static walk, `./yargs` (`packages/burgee/src/weight.test.ts`) | 223,425 | 223,480 | +55 | 223,500 -> 223,550 |
| static walk, `./yargs/v17` | 226,467 | 226,522 | +55 | 226,500 -> 226,600 |
| static walk, `./yargs/v17/yargs` | 226,691 | 226,746 | +55 | 226,750 -> 226,800 |
| `/docs/weight`, `burgee/yargs` everything (`npm run weight:page`) | 110,509 | 110,578 | +69 | the page follows |
| `/docs/weight`, `burgee/yargs/v17` everything (`scripts/subpath-weight-lock.test.ts`) | 111,669 | 111,738 | +69 | `ours` 111,669 -> 111,738 |
| `/docs/weight`, `burgee/yargs/v17/yargs` everything | 111,476 | 111,545 | +69 | the page follows |
