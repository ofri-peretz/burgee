---
id: D-20261113-yargs-argsert-usage-cache-bytes
subject: '`burgee/yargs` ran parse-command 70 times per `parseSync()` of the B5 program, and #1407 made each run dearer, so B5 read 1.12–1.15 against its 1.1 ceiling every night from 2026-11-02. Parsing each `argsert` usage string once fixes it and costs bytes on every yargs entry. Do we pay them, raise the runtime ceiling, or find a smaller fix?'
taken: 'Taken by the agent closing B-20261112-burgee-yargs-b5-runtime-over-ceiling, under the owner''s delegation of budgets and trade-offs (burgee-owner-delegates-tradeoffs), 2026-11-13'
date: '2026-11-13'
superseded_by: —
---

**We pay them: +80 B bundled on `burgee/yargs`, and +180 B on each static walk.** The runtime
ceiling stays at 1.1. Each byte ceiling moves with the measurement: the new reading, plus the
~32 B that CI reads heavier, rounded up to the next 50, as every earlier `burgee/yargs` raise did.

## What the bytes buy

Every builder method checks its arguments with `argsert('<string> [object]', …)`, and the port
parsed that literal with parse-command on every call: 70 times for one `parseSync()` of B5's
21-option program. #1407 (`b3aaede3`) made parse-command linear on a long run of dots, and with it
each call dearer in a fresh process. A `Map` from usage string to its parse, capped at 256 entries
because `argsert` is exported, takes parse-command off that path.

B5 on GitHub's x64 runners, median and range of 15 fresh-process readings (three runners, five
each; the bisect table is in the gap):

| build | `burgee/yargs ÷ yargs` |
| :-- | :-- |
| #1407's parent, `24c4a09c` | 1.068 (1.042–1.090) |
| main, `f52e164e` | 1.123 (1.093–1.151) |
| this change | 0.820 (0.810–0.847) |

`burgee/yargs` is now faster than yargs on B5, and 0.25 under the 1.1 ceiling rather than 0.03
over it. yargs' own suite still grades the façade 816 / 816, and yargs 17's 793 / 794.

## Raising the runtime ceiling instead, rejected

The 6% was not the price of anything that has to stay. #1407's linear-time guarantee is kept: the
cache sits in front of parse-command, not in place of it, and `utils.test.ts`' growth cases still
hold. Raising 1.1 would have accepted a slower parse to save 80 B.

## Smaller fixes, rejected

- **A null-prototype object and `??=`, uncapped.** It is smaller, but it grows without bound
  when a program hands the exported `argsert` strings it builds, and a `__proto__` key is one
  more case to get right.
- **Undoing #1407's `stripBrackets` and typed array.** It would put back the quadratic case that
  failed the `Quality (Full) Gate` (D-20261101-yargs-parse-command-linear-bytes), and it leaves
  the 70 calls in place.

## The bytes

Both trees were measured locally on clean builds, on the same machine. Main is at `8886ca5e0d`.

| measure | main | this change | step | ceiling |
| :-- | --: | --: | --: | :-- |
| B4 bundled, `burgee/yargs` (`benchmarks/axes/weight.ts`) | 110,366 | 110,446 | +80 | 110,400 -> 110,500 |
| `lighter-than-yargs` (against yargs' 111,686) | 0.985 | 0.986 | | ≤ 1, unchanged |
| static walk, `./yargs` (`packages/burgee/src/weight.test.ts`) | 223,511 | 223,691 | +180 | 223,550 -> 223,750 |
| static walk, `./yargs/v17` | 226,553 | 226,733 | +180 | 226,600 -> 226,800 |
| static walk, `./yargs/v17/yargs` | 226,777 | 226,957 | +180 | 226,800 -> 227,000 |
| `/docs/weight`, `burgee/yargs` everything (`npm run weight:page`) | 110,719 | 110,799 | +80 | the page follows |
| `/docs/weight`, `burgee/yargs/v17` everything (`scripts/subpath-weight-lock.test.ts`) | 111,879 | 111,959 | +80 | `ours` 111,879 -> 111,959 |
| `/docs/weight`, `burgee/yargs/v17/yargs` everything | 111,686 | 111,766 | +80 | the page follows |
