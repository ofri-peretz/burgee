---
id: D-20261029-yargs-english-embedded-bytes
subject: '`burgee/yargs` stops reading `locales/` to speak English (A-20261028-yargs-locale-read-at-runtime). The English table and the list of shipped locales move into the module graph, which costs bytes on every yargs entry. Pay them, or find English another way?'
taken: 'Taken by the agent closing the gap, under the owner''s delegation of budgets and trade-offs (burgee-owner-delegates-tradeoffs), 2026-10-29'
date: '2026-10-29'
superseded_by: —
---

**Pay them: +821 B bundled on `burgee/yargs`, +740 B on its static walk.** The ceilings move
with the measurement, each the reading plus the ~32 B CI reads heavier, rounded up to the next
50, as every earlier `burgee/yargs` raise did.

## What the bytes buy

`yargs-compat` X11. A `bun build --compile` binary of a `burgee/yargs` program ran nothing on
`burgee@1.9.2`: `shim.ts` walked up from its own file to `package.json` at module load, and
inside the binary that walk reaches the virtual `/$bunfs`, whose `readdirSync` throws. Under
Node, a locale read failing with anything but `ENOENT` (igir#2244's `EUNKNOWN`) failed every run.
Now English is served from `yargs/y18n-locales.js`, the walk runs only when a locale other than
English is first read, and any failure on that path serves English.
`packages/burgee/src/yargs/locales-embedded.test.ts` holds it: 15 of its 18 cases were red on
`f801cf48e7`, and the other 3 pin what must not change (German still read from disk).

## The bytes

Measured on main at `8650d04352`, which already carries #1361's +186 B
(D-20261029-yargs-parse-callback-not-intercepted), and on this change merged onto it. Against
`f801cf48e7`, before #1361, the step was the same: +821 bundled, +740 on each walk.

| measure | main `8650d04352` | this change | step | ceiling |
| :-- | --: | --: | --: | :-- |
| B4 bundled, `burgee/yargs` (`benchmarks/axes/weight.ts`) | 109,335 | 110,156 | +821 | 109,400 -> 110,200 |
| `lighter-than-yargs` (against yargs' 111,686) | 0.979 | 0.986 | | ≤ 1, unchanged |
| static walk, `./yargs` (`packages/burgee/src/weight.test.ts`) | 222,685 | 223,425 | +740 | 222,750 -> 223,500 |
| static walk, `./yargs/v17` | 225,727 | 226,467 | +740 | 225,800 -> 226,500 |
| static walk, `./yargs/v17/yargs` | 225,951 | 226,691 | +740 | 226,000 -> 226,750 |
| `/docs/weight`, `burgee/yargs/v17` everything (`scripts/subpath-weight-lock.test.ts`) | 110,848 | 111,669 | +821 | `ours` follows |

Measured locally on clean builds of both trees, on the same machine, with `bundledRecords` and
the static walk.

## Why this way and not another

- **Embed only what English changes.** y18n answers a key it has no entry for with the key
  itself, and `__n` with the singular or plural it was handed. So of `en.json`'s 35 entries the
  module carries the 7 that are not their own key: the six plural pairs and
  `Implications failed:`, which English prints as `Missing dependent arguments:`. Embedding all
  35 would add the other 28, about 970 B of key-and-value pairs, for output identical to the byte.
- **Embed all 29 locales.** 63,091 B of JSON, about 60 KB in every bundle, to serve languages
  most programs never select. Not proportionate. A non-English locale still reads its file,
  which is where igir needed no file at all, and a binary with no `locales/` beside it speaks
  English in those locales instead of failing.
- **A static `import en from '../locales/en.json' with { type: 'json' }`.** Under Node that is
  a file read at load, which is what the gap asks to remove: a bundler inlines it, but a program
  run unbundled would still fail at load on a drive like igir#2244's. It would also carry all 35
  entries.
- **Keep the list of shipped locales out (`SHIPPED`, about 200 B).** Without it, choosing
  between `de_AT.json` and `de.json`, or knowing that `en_US` is English, takes a `statSync`
  per candidate, the read this change removes. The list also means a locale burgee does not
  ship is never looked for on disk.

## One source of truth

`locales/*.json` stay the source. `packages/burgee/scripts/generate-yargs-locales.mjs` renders
`src/yargs/y18n-locales.ts` from them. `--check` runs in the package's `build`, and
`locales-embedded.test.ts` compares its values with `locales/`, so an edited, added or removed
locale fails rather than drifts.

## The control band

`yargs-front-end-bundled-bytes` steps by +821 B on merge. This decision is the attribution the
rule in D-20261019-front-end-byte-steps-rebase-bands asks for. The band's `rebase` entry names an
observation, `<date>-<sha>-ci`, that exists only once the merge commit's benchmark run is recorded,
so it is added then, naming this decision.
