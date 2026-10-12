# Design — `burgee/commander` bundles no heavier than it has to, and every byte over commander is named

Intent: [`intent.md`](./intent.md). **Status:** approved.

**Accepted by the owner, 2026-10-12, by instruction: plan, then build.**

---

## The measurement this starts from

Taken 2026-10-12 at `10edb48`, Node 24.13.0, from `benchmarks/`, so that resolution matches the
page. The method is `/docs/weight`'s own (`scripts/subpath-weight.ts`):

```bash
npx turbo run build --filter=burgee...
cd benchmarks
printf "export * from 'burgee/commander';\n" > .subpaths/diet/e.mjs
../node_modules/.bin/esbuild .subpaths/diet/e.mjs --bundle --minify --format=esm \
  --platform=node --splitting --outdir=.subpaths/diet/out --metafile=.subpaths/diet/meta.json
```

`initialBytes` (in `benchmarks/axes/weight.ts`) counts the entry chunk, plus every chunk the entry
reaches through `import-statement` edges. A `dynamic-import` edge isn't counted, because the chunk
behind it isn't fetched until its branch runs.

| Output | Bytes | Counted |
| :-- | --: | :-- |
| entry `e.js` | 52,057 | yes |
| shared chunks (statically imported) | 3,112 + 5,819 + 219 | yes |
| **initial load** | **61,207** | the page's number |
| `completions-*.js` (dynamic) | 8,534 | no, already lazy |
| `mcp-*.js` (dynamic) | 5,261 | no, already lazy |
| `parse-hooks-*.js` (dynamic) | 446 | no, already lazy |

### Attribution, by input module (`bytesInOutput` over the initial chunks)

| Module | burgee | commander 15.0.0 | Over |
| :-- | --: | --: | --: |
| `commander/command.js` | 34,296 | 27,226 | +7,070 |
| `commander/help.js` | 6,510 | 6,518 | −8 |
| `commander/option.js` | 3,027 | 3,045 | −18 |
| `commander/argument.js` | 1,047 | 1,050 | −3 |
| `commander/error.js` | 366 | 340 | +26 |
| `suggest.js` / `suggestSimilar.js` | 871 | 870 | +1 |
| `commander.js` / `index.js` | 70 | 70 | 0 |
| `plugin.js` | 2,365 | — | +2,365 |
| `schema.js` | 2,112 | — | +2,112 |
| `definition.js` | 1,857 | — | +1,857 |
| `manifest.js` | 1,513 | — | +1,513 |
| `runtime.js` (the `host` seam) | 747 | — | +747 |
| `facade-failure.js`, `errors.js`, `exit-code.js` | 589 | — | +589 |
| `names.js` | 194 | — | +194 |
| **`bellpull`**: `which` 1,184, `spawn-args` 946, `escape` 500, `executable` 465, `cross-spawn` 456, `shebang` 413, `enoent` 411, `ambient` 342, `runtime` 264 | 4,981 | — | +4,981 |
| chunk glue (cross-chunk names, wrappers) | 662 | 210 | +452 |
| **Total** | **61,207** | **39,329** | **+21,878** |

The port of commander is at parity, within 26 B per file. The excess comes from three sources:
`bellpull/cross-spawn` (4,981 B), the burgee core modules the façade imports (9,377 B), and the
burgee-only methods on `Command` (about 7,070 B inside `command.js`). Those methods are sized from
the minified entry by their spans:

| Method | Bytes | | Method | Bytes |
| :-- | --: | :-- | :-- | --: |
| `_project` | 804 | | `_runAction` | 440 |
| `_burgeeSurfaceRest` | 701 | | `_runBurgee` | 403 |
| `_optionSpecs` | 624 | | `_prepareBurgee` | 389 |
| `_burgeeSurface` | 507 | | `_runCommanderWay` | 305 |
| `_warnDeprecated` | 285 | | `_emitResult` | 255 |
| `_provenance` | 234 | | `_reportJson`, `_reportHandlerFailure`, `_writeFailure` | 511 |
| `manifest`, `use`, `burgee`, `effects`, `deprecate`, `_declares`, `_root` | 421 | | **sum** | **5,879** |

### What the owner's candidate list measures as

| Candidate | Measured |
| :-- | :-- |
| `--mcp`, completions behind `import()` | **Already lazy** (8,534 + 5,261 B off the initial load). The code that _calls_ them, `_burgeeSurface` and the `--mcp` branch of `_burgeeSurfaceRest`, is still static: R2 |
| `--skill`, Markdown help, locale | **Not in this bundle.** `commander/help.js` is 6,510 B against commander's 6,518; none of `skill.js`, `markdown-help.js` or `locale.js` is an input |
| `--schema` lazy | **Not without breaking a contract.** It answers inside a synchronous `parse()`; see _Rejected alternatives_. 5,725 B stay |
| cross-spawn only when spawning | **4,817 B, measured: R1** |
| Duplicated code façade ↔ core | **None in this bundle.** The one duplicate in the tree is `render()`, identical in `commander/command.ts` and `yargs/burgee.ts`. Both bundles need it, so sharing it saves the commander bundle nothing. The core modules the façade imports are imported, not copied |

### Prototype, measured the same way

| Step | Initial load | Δ |
| :-- | --: | --: |
| `main` at `10edb48` | 61,207 | |
| + R1 (spawn through `node:child_process`; `bellpull` only behind `import()` on the Windows non-node path) | 56,390 | −4,817 |
| + R2 (`completion` and `--mcp` bodies in a lazily loaded `commander/surfaces.js`) | 55,633 | −757 |

### The residual at 55,633 B, every byte named

16,304 B over commander. Each line is held in the initial load by a synchronous contract:

| What | Bytes | Why it can't load on demand |
| :-- | --: | :-- |
| `--schema`: `schema.js` 2,112, `manifest.js` 1,513, `names.js` 194, `_project` 804, `_optionSpecs` 624, `_burgeeSchema` 293, `_declares` 88, the `manifest` getter 97 | 5,725 | Answered inside a synchronous `parse()` (`commander/sync.test.ts`, third case). See _Rejected alternatives_ |
| `use(plugin)`: `plugin.js` 2,365, `definition.js` 1,857, `use` 40 | 4,262 | A refused plugin throws a `PluginError` from `use()`, where it was registered |
| `--json` envelope, E1 floor, injected streams: `_prepareBurgee`, `_runBurgee`, `_runCommanderWay`, `_runAction`, `_emitResult`, `_provenance`, `_reportJson`, `_reportHandlerFailure`, `_writeFailure`, `burgee`, plus `facade-failure.js`, `errors.js`, `exit-code.js` 586 | 3,176 | A synchronous action's envelope and exit code are settled before `parse()` returns |
| `host` seam (`runtime.js`) | 747 | Every stream, exit and env read goes through it. It's how `--mcp` captures stdout and how the harness injects |
| deprecation and effects: `_warnDeprecated` 285, `effects` 39, `deprecate` 48 | 372 | The warning prints before a synchronous action runs |
| the lazy-surface router: `_burgeeSurface` 275, `_root` 54 | 329 | It is what decides whether to load the lazy chunk |
| the rest of `command.js`: `e1`, `render`, `useColor`, `isThenable`, the burgee lines inside shared methods, and R1's split | 1,368 | Same path as the rows above |
| chunk glue over commander's | 335 | Two chunks instead of one |
| port drift (`help`, `option`, `argument`, `error`, `suggest`) | −10 | |
| **Total** | **16,304** | 55,633 − 39,329 |

## Requirements

- **R1 — The spawn is commander's, and `bellpull` loads only on the path commander can't take.**
  `_executeSubCommand` spawns through `node:child_process` (its default import, read at the call
  site, so the ~23 mocked `executableSubcommand` cases still see the mock) on every path commander
  15 spawns: POSIX, and Windows through `node`. A Windows executable that isn't launched through
  node (a `.cmd`, a `.bat`, a non-node shebang) is the case commander can't run since Node's
  EINVAL hardening. It loads `bellpull/cross-spawn` through `import()` and spawns when the import
  settles. `_checkForMissingExecutable` still runs before the import, so a missing file throws
  synchronously as it does today. `runningCommand`, the signal forwarding, and the `close` and
  `error` handlers are the same code on both paths (`_watchSubCommand`).
- **R2 — Surfaces that already answer with a Promise load together.** `completion <shell>` and
  `--mcp` are routed by a short static check in `_burgeeSurface` to one lazily loaded
  `commander/surfaces.js`. That module holds the completion rendering, the `--mcp` `invoke`
  closure and the server start. A `completion` with an unknown shell falls through to `--schema`
  and then to the program, as it does today. `--schema` stays in `command.ts`.
- **R3 — The initial load is locked, by module.** A new
  `scripts/commander-front-end-lock.test.ts` bundles `export * from 'burgee/commander'` with the
  page's method and walks `import-statement` edges. It fails when any `packages/bellpull/` module,
  `completions`, `mcp`, `parse-hooks` or `commander/surfaces` is in the initial load. It also fails
  when an input appears that isn't in its table of the modules above, so a new static import
  arrives with a row in this spec.
- **R4 — The ratchet moves down to each measurement, and the floor is recorded.** Each build PR
  re-measures and lowers four numbers to it:
  - the `burgee/commander` and `burgee/commander/extra-typings` rows on `/docs/weight`;
  - an `OVER_INCUMBENT` row for each in `scripts/subpath-weight-lock.test.ts` (the table #1039
    introduces, with `ours` at the new measurement and a gap file);
  - `BUNDLED_CEILING['burgee/commander']` in `benchmarks/axes/weight.ts`;
  - `lighter-than-commander` in `.sdlc/bands/claim-ratchets.json`, through `npm run
    ratchets:propose` and a new history entry.

  The judgement that keeps the residual is
  [`D-20261012-commander-front-end-floor`](../../decisions/D-20261012-commander-front-end-floor.md),
  taken with this spec. It supersedes D-102's "cannot go lazy" for the spawn. The last PR
  restates its numbers if the measured floor differs from the prototype.

## Design

**R1.** One edit to `_executeSubCommand`. The branch structure stays as commander's: `win32`
checks for a missing executable first, and `launchWithNode` decides the argv. The tail of the
method, from `if (!proc.killed)` through `this.runningCommand = proc`, moves unchanged into
`_watchSubCommand(proc, executableFile, executableDir, name)`, so the lazy path and the
synchronous path share it. The static `import * as crossSpawn from 'bellpull/cross-spawn'`
becomes `import childProcess, { type ChildProcess } from 'node:child_process'`. Prototype:
56,390 B, `command.js` +175 B for the split.

The ordering this changes is one step on one path. On Windows, for a non-node executable, the
child is spawned after the `import()` settles instead of before `parse()` returns, and
`runningCommand` is set then. commander's own suite skips every `executableSubcommand` case on
`win32`. That path didn't run under commander at all (it spawned the `.cmd` directly and got
EINVAL), so nothing that worked before changes order. Jev's `needs_model` question gets a low
answer: one deferred step on a single path, no retries, no concurrency. So no `.qnt`.

**R2.** `_burgeeSurface` keeps the `--` terminator scan and two predicates
(`head[0] === 'completion'` with no user `completion` command, and `head[0] === '--mcp'` with no
user `--mcp`). Either one returns `import('./surfaces.js').then(({ serveSurface }) =>
serveSurface(this, head))`. Otherwise it returns `this._burgeeSchema(head)`, which is today's
`--schema` branch, renamed from `_burgeeSurfaceRest` now that it is the only thing left in it.
`surfaces.ts` imports `completions.js` and `mcp.js` statically. They join one chunk instead of two,
so a run that needs neither loads neither. Prototype: 55,633 B.

**R3** is written first, in R1's PR, with its module table at the post-R1 state. It is red on
`main` (it names nine `bellpull` modules). R2's PR adds `commander/surfaces` to its lazy list.
The lock reads `dist/`, which the root suite builds before it runs, the same precondition
`tree-shake-fixture.test.ts` has.

**R4.** If #1039 is not on `main` when R1's PR opens, `OVER_INCUMBENT` is introduced there in the
exact shape #1039 uses (`incumbent`, `bytes`, `ours`, `gap`) with the `burgee/commander` row. #1039
then merges onto it, and that merge is a one-line union. The gap file is `npm run ledger -- new
gap B commander-front-end-bundles-heavier`. Its _closes when_ clause is "≤ 39,329 B or the
decision in R4 accepts the floor".

Order: R1 with R3 and R4's first ratchet step, then R2 with R4's second step and the decision.
Each PR comes from an up-to-date `origin/main`, and each lowers the number.

## Verification

| R | Check | Shown failing first by |
| :-- | :-- | :-- |
| R1 | `scripts/commander-front-end-lock.test.ts`: no `packages/bellpull/` input in the initial load. `packages/burgee/src/commander/*.test.ts`: under `host.platform === 'win32'`, a `.cmd` subcommand spawns through `bellpull/cross-spawn` after the import settles, and a missing one still throws synchronously. `npm run compat -- commander --control` stays at 1360 / 1360 | today the lock lists nine `bellpull` modules |
| R2 | the same lock: no `commander/surfaces`, `completions` or `mcp` input in the initial load, and `command.js`'s share at or below the post-R2 measurement. The existing completion and `--mcp` façade tests pass unchanged, and `sync.test.ts` passes unchanged | today `command.js` contributes 34,296 B and `dist/commander/surfaces.js` doesn't exist |
| R3 | the lock's own reader cases: an unknown input fails, and an empty initial load fails, so the gate can't pass vacuously | written red against `main` |
| R4 | `scripts/subpath-weight-lock.test.ts` (`OVER_INCUMBENT` at the new `ours`); `benchmarks` B4 (`BUNDLED_CEILING`); `scripts/claim-ratchets-lock.test.ts` | `/docs/weight` reads 61,207 against a row set at the post-PR measurement |
| constraints | `npm run compat -- commander --control` and `-- extra-typings --control` (if on `main`); `packages/burgee/src/weight.test.ts` (`./commander` static only falls); B2 via `npm run bench` | |

## Status

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | **Built** 2026-10-12 | `commander/command.ts` (`_executeSubCommand`, `_watchSubCommand`): `node:child_process` on every path commander takes, and `import('bellpull/cross-spawn')` on the Windows non-node path. 61,207 → **56,405 B** (B4's fixture 60,905 → 56,103). Oracle `commander --control`: 1360 / 1360. `./commander`'s static walk now imports nothing (`allow: []`), and B2's fixture loads 17 modules instead of 26 (`benchmarks/cold-start-modules.test.ts`); B2 measured 1.055 against a gate of 1.4 | `commander/spawn.test.ts` (a `.cmd` on `win32` spawns through bellpull after the import settles, with `runningCommand` unset until then; a missing one throws before anything loads; a `.js` on `win32` and a POSIX executable spawn synchronously through `child_process`). Red on `main`: `expected { Object (_events, …) } to be undefined` and `expected "spawn" to be called with arguments` ×2 |
| R2 | Not built | | |
| R3 | **Built** 2026-10-12 | `scripts/commander-front-end-lock.test.ts`, with its module table at the post-R1 state | Red on `main`: nine `packages/bellpull/dist/*.js` inputs in the initial load, under both the lazy rule and the unnamed-module rule |
| R4 | In part: step 1 of 2 | `OVER_INCUMBENT['burgee/commander']` at 56,405 with gap `B-20261012-commander-front-end-bundles-heavier`; `BUNDLED_CEILING` 61,100 → 56,200. `lighter-than-commander` (measured 1.435 locally, so the rule gives 1.44) comes down in the first commit after the Benchmarks workflow publishes a CI reading of this build: `claim-table-lock.test.ts` holds a met row to the newest CI document, which still says 1.558 | `subpath-weight-lock.test.ts`, red against the page before regeneration: `bundles 61207 B, over the 56405 B its ratchet holds` |

**Built: 2. Not built: 2.**

## Rejected alternatives

- **`--schema` behind `import()`.** It saves about 5.7 KB, and the trade is unsafe. `_burgeeSurface`
  returns `true` and `parse()` returns `this`, and then the program's own code after `parse()`
  runs. That is true today too. A common commander shape is `program.parse(); if
  (!program.args.length) program.help();`. With a lazy schema, `help()` exits the process before
  the document prints, so an agent asking for `--schema` gets help text. Synchronous, the document
  is on stdout first. `sync.test.ts`'s third case holds this. A recorded attempt in `command.ts`
  saved 2.2 KB and printed nothing.
- **`use()` validates later.** A refused plugin would surface at `parse()` or not at all, away
  from the line that registered it. It saves 4.2 KB and loses the one place a plugin error points
  at its cause.
- **`createRequire` / `require(esm)` to load synchronously on demand.** It works under Node and
  breaks every bundle. esbuild leaves the `require` unresolved, and the bundled program throws
  `Cannot find module` at the first `--schema`. That would be shrinking the number by shipping a
  broken bundle.
- **A top-level `await import()` in the entry.** It moves bytes out of the counted initial load
  while still loading them on every run. That games `initialBytes` without changing what a user
  pays.
- **Drop `bellpull` from the façade entirely.** `.cmd` and `.bat` subcommands on Windows would
  then fail the way they fail under commander. R1 keeps that fix and charges it to the one path
  that uses it.
- **Share `render()` between the two façades.** That's tidier, and it moves 0 B in either bundle.
  It stays out of this intent so the diff in `commander*` stays small while two other lanes work
  there.

## Out of scope

- The core `burgee` bundle and its `lighter-than-cac` ratchet. R1 and R2 change nothing in it.
- `burgee/yargs`, already under yargs (0.969).
- Shrinking `plugin.ts`, `definition.ts` or `schema.ts` themselves. Those are core modules, every
  front-end pays for them, and a cut there is a core intent with core's gates.
