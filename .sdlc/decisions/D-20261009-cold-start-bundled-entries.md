---
id: D-20261009-cold-start-bundled-entries
subject: 'A-20261009-burgee-cold-start: should each package''s published entries be bundled with esbuild (`splitting: true`, family packages and `node:` external) to cut the files on the start-up path'
taken: Owner
date: '2026-10-09'
superseded_by: —
---

**Default, until the owner says otherwise: do not adopt it. esbuild code splitting does not
reach either band, and the one variant that keeps the drop-ins passing makes burgee's own
cold start slower.** The build stays one `tsc` file per source module, and the gap stays open.
This is escalated rather than taken because it is a build change for every package, and both
variants move published bundle figures. One variant also breaks three published ratchets.

## What was built

The prototype was a post-`tsc` step for `burgee`, `closeout`, `seniority`, `roundel` and
`bellpull`, the five packages on the B2 start-up path. Its input was `tsc`'s `dist/*.js`.
Its settings:

- esbuild 0.28, already a root devDependency, so no dependency was added;
- `bundle`, `splitting: true`, `format: 'esm'`, `platform: 'node'`, `target: 'node24'`;
- `packages: 'external'`, so no family package is ever inlined into another;
- entries are every `exports`/`bin` `.js` target, plus `closeout/dist/ambient.js`, which
  `signal-exit.cjs` `require()`s by path, so it stays the one instance every entry shares;
- chunks go at the `dist/` root, so `import.meta.url` reads such as `../package.json` keep
  their meaning;
- `.d.ts`, `.cjs` and `.json` are left exactly as `tsc` wrote them.

The order was `tsc → strip-comments → bundle → strip-comments`. Two variants were measured:
**V1** with esbuild's defaults, and **V2** with `keepNames: true`.

Two traps in the first cut would have produced wrong numbers. Both are worth knowing before
anyone tries this again:

1. **Bundling `tsc`'s raw output keeps edges that no longer exist.** Under
   `verbatimModuleSyntax`, a type-only `import { type X } from './x.js'` emits
   `import {} from './x.js'`. Today's `strip-comments` pass (`ts.transpileModule`) drops that
   import. esbuild keeps it as an evaluation edge. Bundled before stripping, `roundel/plugin`
   reached 13,382 B against its 3,000 B budget, and the `burgee` fixture measured 1.3 to
   1.6 ms *slower*. Stripping first removed both effects.
2. **esbuild prints specifiers in double quotes, and every `weight.test.ts` walker matches
   only `from '…'`.** On esbuild's raw output, burgee's walker followed nothing. It reported
   `[]` for every entry's imports and passed byte budgets it was not measuring. The
   prototype rewrote specifiers back to single quotes through the TypeScript AST. The same
   blind spot exists on main today: `burgee/src/yargs/*.ts` is written with double quotes,
   so `./yargs`'s walker does not see `cliui.ts`'s static `import … from "linegauge"`. With
   the quotes normalised, `./yargs` reports `linegauge` against an `allow` of `[]`. On main,
   the `burgee-yargs` fixture loads linegauge's eight files too, so this is a pre-existing
   lock gap and not a prototype regression.

## What was measured

The method is the gap's. Modules come from a `module.registerHooks` load hook. CPU is each
child's own `process.cpuUsage()` at exit. Rounds are interleaved and the order is shuffled
each round. Each figure is **100 rounds, run twice**. Every run compares a fresh copy of
main's `dist` against a fresh copy of the prototype's, made at the same time. Fresh copies
matter: an A/A run of one long-used tree against a new copy of itself read +1.0 to +1.3 ms
on `burgee`. Fresh A/A controls read −0.12 to +0.46 ms. Machine: darwin, Node 24.13.0, main
at `a37caac`.

| fixture: modules loaded, incl. the fixture | main | V1 | V2 (`keepNames`) |
| :-- | --: | --: | --: |
| `burgee.mjs` | 27 | 22 | 26 |
| `burgee-commander.mjs` | 26 | 17 | 18 |
| `burgee-yargs.mjs` | 32 | 20 | 21 |

| CPU, two runs of 100 rounds | main | V1 | V2 |
| :-- | :-- | :-- | :-- |
| `burgee ÷ cac`, ratio of medians | 1.355 / 1.346 | **1.308 / 1.320** | **1.486 / 1.494** |
| per-round median, and range | 1.359 [1.13–1.73], 1.353 [1.08–1.69] | 1.321 [1.09–1.63], 1.332 [1.04–1.59] | 1.498 [1.34–2.24], 1.492 [1.37–1.78] |
| `burgee`: paired median Δ | — | −1.10 / −0.56 ms | **+2.66 / +2.87 ms** |
| `burgee/commander ÷ commander`, ratio of medians | 1.144 / 1.120 | **1.077 / 1.057** | 1.079 / 1.095 |
| per-round median, and range | 1.142 [0.75–1.33], 1.124 [0.96–1.31] | 1.075 [0.75–1.38], 1.045 [0.89–1.32] | 1.074 [0.88–1.66], 1.084 [0.83–1.35] |
| `burgee-commander`: paired median Δ | — | −1.87 / −2.18 ms | −1.44 / −1.10 ms |

The V2 runs had their own `main` arm, at 1.388 / 1.367 and 1.127 / 1.119.

**Against the bands:** CI reads `burgee/commander ÷ commander` at 1.14 to 1.20, and the
`burgee ÷ cac` series at 1.47 to 1.56.

- **`burgee ÷ cac` ≤ 1.35 is not reached by either variant.** V1 saves 0.6 to 1.1 ms. Moving
  CI from about 1.5 to 1.35 takes roughly 3.5 ms at cac's 24 ms. V2 makes it worse.
- **`burgee/commander ÷ commander` ≤ 1.10 might be reached by V1, and V1 is the variant that
  breaks commander.** V1 saves 1.9 to 2.2 ms, and moving CI from 1.14–1.20 to 1.10 takes
  1.2 to 3 ms at commander's 30 ms. V2 keeps the suite passing and saves 1.1 to 1.4 ms. That
  is enough only if CI sits at the low end of its range.

Wall clock is what B2 itself times, and on this machine it is dominated by file-open latency.
Two paired runs gave `burgee` −1.3 / −0.7 ms and `burgee-commander` −8.5 / −5.5 ms. The
`burgee ÷ cac` ratio moved by up to 0.2 between those two runs, so it is not used to judge.

Why the module count falls so little: esbuild makes one chunk for each distinct set of
entries that reaches a module, and every internal `import()` counts as an entry. burgee has
16 entries and about 20 lazy `import()` targets, and its start-up path still loads 11 burgee
chunks. closeout went from 13 files to 14, and roundel from 12 to 15.

## What it broke

Every lock and suite was run on both variants and on main. The suites were the five
packages' tests, `benchmarks`, `vitest.root.config.ts` and the full compat oracle. On main the
only failure was this file, before it was filled in.

**Real regressions:**

| lock | V1 | V2 |
| :-- | :-- | :-- |
| compat oracle: drop-in suites | **commander 1351 / 1360.** esbuild renamed a colliding class to `_Command`, and `imports.test.cjs` reads `constructor.name`. yargs 816 / 816, chalk 59 / 59 | commander 1360, yargs 816, chalk 59 |
| `tree-shake-fixture` | seniority `{ Explorer }` from the root costs 3 B more than from `./cosmiconfig` | **6 cases**, e.g. `burgee/testing { ExitCode }` 98,504 B against 1,107 B from the root |
| `side-effects-lock` | passes | **fails in all five packages**: every `__name(fn, "fn")` is a top-level call |
| `readme-gates-lock`, the published bundle figures | core 24,221 → 24,425 B; `lighter-than-cac` 2.317× → 2.337× (ratchet 2.35×) | core **30,854 B**; `lighter-than-cac` **2.952×**, `lighter-than-commander` **1.667×** (1.565×) and `lighter-than-yargs` **1.019×** all fail |
| per-entry byte budgets (`weight.test.ts`) | 11 over, e.g. closeout `./cursor` 2,310 / 1,900 B, roundel `.` 15,086 / 14,600 B, burgee `./config` 188 / 130 B | about 40 over, in every package |
| `seniority/shape` ceiling | passes | dist 142,010 B against 140,000 B; `yaml.js` 25,575 B against 25,000 B |

**Locks that would need their expectation restated** (the instrument, not the product):

- `benchmarks/cold-start-modules.test.ts` locks module names. Chunk names carry a content
  hash, so the list would move on every edit unless names were made stable.
- `burgee/src/pty-signal.test.ts` imports the non-exported `dist/shutdown.js`. Pointed at the
  chunk that now holds `processTeardown`, all 4 cases pass, so E5 holds.
- `bellpull` weight: the "`./which` free of the spawner" and Y9 checks name files, and
  modules now live inside chunks.
- `roundel/subpath-isolation.test.ts` reads relative edges file by file, and expects
  `runtime.js` to exist.
- The weight bands (`npm run weight:converge`). Packed bytes in V1: closeout 121,319 →
  122,460, bellpull 116,607 → 117,115, seniority 223,679 → 224,574.

`drop-in-require-shape-lock` (CommonJS `require()` of every drop-in), `drop-in-type-surface-lock`
(TypeScript consumers), `api-reference-lock`, `pack-list-lock` and `independence-install-lock`
pass on both variants. The signal-exit row reads 126 / 135 and the cosmiconfig row 240 / 243
on main as well (the darwin rows).

**Bytes in `dist/*.js`**, main → V1 → V2:

| package | V1 | V2 |
| :-- | :-- | :-- |
| burgee | 517,608 → 514,683 (−0.6%) | 539,289 (+4.2%) |
| closeout | 25,692 → 26,749 (+4.1%) | 29,726 (+15.7%) |
| seniority | 115,723 → 116,534 (+0.7%) | 124,785 (+7.8%) |
| roundel | 30,848 → 32,241 (+4.5%) | 35,261 (+14.3%) |
| bellpull | 31,825 → 32,249 (+1.3%) | 35,203 (+10.6%) |

## The trade-offs

- **Stack traces and debugging.** Neither variant is minified, so code stays readable. Frames
  name `_chunk-OK7SNMNU.js` instead of `execute.js`, though, and the hash changes with
  content. Source maps were off, as the shipped dist is today.
- **Tree-shaking for consumers.** V1 nearly holds, at 3 B. V2 gives it away to `__name`.
- **Drop-in fidelity.** Without `keepNames`, any class or function whose name collides
  across modules is renamed, and a suite that reads `.name` sees it.

## Recommendation

Do not wire esbuild code splitting into the build. Close no part of the gap with it.

A sibling draft intent in another worktree (`intents/bundled-entries`, not on main) reached
the same esbuild result independently: 22 / 17 files, −0.8 to −1.0 ms on `burgee`. It
proposes a hot-entry partition with manual chunks, reporting 8 / 4 files and −7 to −8 ms.
That needs a bundler with chunk control (rolldown, in the lockfile through vitest but not a
direct devDependency), and so it is a dependency decision for the owner. Any such build
inherits three requirements from this measurement:

- `keepNames`-equivalent fidelity without top-level `__name` calls;
- bundling after `strip-comments`;
- quote-agnostic weight walkers.

The walker gap is worth fixing on main whatever the owner decides.
