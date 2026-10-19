# Design — an off-major project gets a work list, and a move only where nothing is in its way

Intent: [`intent.md`](./intent.md). **Status:** approved — accepted by the coordinator under the
owner's 2026-10-12 delegation,
[`D-20261019-migrate-older-majors-design-accepted`](../../decisions/D-20261019-migrate-older-majors-design-accepted.md).

Staged on 2026-10-18 against `main` at `1013b65db5`; **re-grounded on 2026-10-19 against `main`
at `326907eca6`**, after #1086 claimed commander 14 (`burgee/commander/v14`), #1165 claimed
yargs 17 (`burgee/yargs/v17`, `burgee/yargs/v17/yargs`), and #1168 and #1172 changed `migrate.ts`.
What moved, and what this spec changed because of it, is under
[Re-grounded](#re-grounded-2026-10-19). Evidence: barrier 1 in
[`adoption-barriers-2026-10.md`](../../research/adoption-barriers-2026-10.md). The `manual` arms of
wait-port, madge, tsc-alias and qrcode are in
[`field-trial.json`](../../research/adoption-barriers/field-trial.json). Each project's source line
was read at its pinned SHA for this spec.

Nothing here hard-codes which majors are claimed: every expectation is derived from
`SUPPORTED_MAJORS` and `PREVIOUS_MAJOR_ENTRIES` in `packages/burgee/src/compat.ts`, which today
claim commander 14 and 15 and yargs 17 and 18.

---

## Today, on `main`

`majorsOf` in `packages/burgee/src/migrate.ts` lists an incumbent whose installed version (or,
with nothing installed, declared range) is on a major `SUPPORTED_MAJORS` does not claim as
`offMajor: { from, found, graded }`, and puts it in `skip`, so no file moves it. A project on a
claimed older major moves to that major's own entry (`previous-majors` R6). Every one of the
trial's four crashing projects is on a major below both claimed ones:

| Project | Found | Nearest claimed | What `main` says |
| :-- | :-- | :-- | :-- |
| wait-port `16083537` | commander `^9.3.0` | 14 | `nothing to rewrite`, one `offMajor` row |
| madge `456057b8` | commander `^7.2.0` | 14 | `blocked: 1 preflight check` (it is CommonJS on `>=18`), one row |
| tsc-alias `1077308b` | commander `^9.0.0` | 14 | `nothing to rewrite`, one row |
| node-qrcode `3848ed2c` | yargs `^15.3.1` | 17 | `nothing to rewrite`, and `imported: []`: its only import is in `bin/qrcode`, which has no extension and is never read |

None of the four is told which line will break, and none is told that a claimed major is closer
than the current one. The trial moved each to the **current** entry by hand, and all four
crashed.

## Requirements

- **R1 — A `bin` is scanned.** `migrate()` scans each file that `package.json` `bin` names, as a
  string or as a map, in addition to `sourceFiles(dir)`. A named file is skipped when it is
  outside `dir` or absolute, missing or not a file, under a `SKIP` directory, or has an extension
  that is not in `SOURCE_EXTENSIONS` (`cli.sh`). A file is counted once, however many names point
  at it, and a path is normalised (`./bin/cli`, `bin\cli`) first.
  - Without this, qrcode's `bin/qrcode` is never read. That is the file where its crash lives.
  - It applies to the rewrite as well: a bin on a claimed major moves like any other file, and
    `removable` no longer names an incumbent that an extensionless bin still `require()`s.
- **R2 — A sourced table of removed APIs.** `packages/burgee/src/migrate-majors.ts` exports
  `REMOVED_APIS: readonly RemovedApi[]` — `{ host, api, removedIn, replacement, source, quote }` —
  with seven rows, read on 2026-10-19 from each incumbent's `CHANGELOG.md` at `v15.0.0`
  (commander) and `v18.0.0` (yargs). Each `quote` is the line at that tag, verbatim.

  | host | api | removedIn | quote (verbatim) | replacement |
  | :-- | :-- | :-- | :-- | :-- |
  | commander | `module-as-program` | 12.0.0 (2024-02-03) | "removed default export of a global Command instance from CommonJS (use the named `program` export instead)" | `const { program } = require('commander')` |
  | commander | `multi-char-short-flag` | 13.0.0 (2024-12-30) | "throw during Option construction for unsupported option flags, like multiple characters after single `-`" | a one-character short flag, or the long flag alone |
  | commander | `esm-mjs` | 15.0.0 (2026-05-29) | "removed deprecated export of `commander/esm.mjs`" | `import { program } from 'commander'` |
  | yargs | `rebase` | 16.0.0 (2020-09-09) | "rebase helper is no longer provided on yargs instance." | `path.relative()` |
  | yargs | `reset` | 17.0.0 (2021-05-02) | "deprecated reset() method is now private (call yargs() instead)." | a fresh `yargs()` instance |
  | yargs | `on-finish-command` | 17.0.0 (2021-05-02) | "onFinishCommand removed, in favor of being able to await promise." | await the promise the command's handler returns |
  | yargs | `singleton` | 18.0.0 (2025-05-26) | "singleton usage of yargs yargs.foo, yargs().argv, has been removed." | `const yargs = require('yargs/yargs'); yargs(process.argv.slice(2))…` |

  `source` is `https://github.com/<repo>/blob/<tag>/CHANGELOG.md#<removedIn without dots>-<date>`.
- **R3 — Detection, decided by evidence, never by names alone.**
  `removedSites(tokens, found, claimed, exports)` walks the token stream `tokensOf` already
  produces. `found` holds the off-major hosts the file imports, each with its major; `claimed`
  the highest claimed major per host; `exports` the façade export lists
  (`FACADE_EXPORTS['burgee/commander']` and `['burgee/yargs']`). A member those export is valid on
  every claimed major, so it is never a use. It returns the sites in line order.
  - **`module-as-program`** and **`singleton`** read a whole module: `require('<host>')` with
    nothing destructured, or a default import, `import B from '<host>'`, with or without named
    imports beside it. (A TypeScript CommonJS build compiles a default import to the same
    `require`.)
    - A binding `B` (`const`, `let`, `var` or a plain `=`, never `x.B =`) is a site at the line
      that makes it when some later `B.<m>` has an `<m>` the façade does not export. `firstUse` is
      that member's line.
    - `require('<host>').<m>` with such an `<m>` is a site on its own line.
    - `{ a, b: c } = require('<host>')` is a site when `a` or `b` is not exported.
    - `require('yargs')(argv)` is the factory, and `require('yargs/yargs')` is never the singleton.
  - **`multi-char-short-flag`**: in a file that imports `commander`, the first argument of
    `.option(`, `.requiredOption(`, `new Option(` or `new <B>.Option(`, when it is a quoted
    literal. Split on `/[ ,|]+/`, any piece matching `/^-[^-]{2,}/` makes a site at the literal's
    line.
  - **`esm-mjs`**: the literal `commander/esm.mjs`, in a file that imports `commander`.
  - **`rebase`, `reset`, `on-finish-command`**: `.rebase(`, `.reset(` and `.onFinishCommand(` in a
    file that imports `yargs`.
  - A site is kept when its API's `removedIn` major is above the found major and at or below the
    highest claimed one.
- **R4 — `offMajor` rows gain `sites`, `nearest` and `move`.**
  - `sites: Removed[]`, each `{ file, line, api, removedIn, replacement, source, firstUse? }`. It
    is always present, and `[]` for a host with no table rows.
  - `nearest: number | null`: the smallest claimed major above the found major, for every
    off-major row.
  - `move: Record<string, string> | null`: each specifier of the host the project imports, with
    the entry it takes at `nearest` (`PREVIOUS_MAJOR_ENTRIES[specifier][nearest]`, else
    `MAPPING[specifier]`), when the gate (R8) lets the move through. It is `null` for a host with
    no table rows, whose removals nothing here checks, and for a host the project imports nothing of.

  Sites are collected in `scanBatch`, by a second `tokensOf` pass that runs only over a file whose
  `seen` names an off-major host with table rows.
- **R5 — A report, never a rewrite.** Nothing in R2–R4 or R8 changes a byte of any file, the exit
  code, `held` or `removable`. `summaryOf` keeps its prefixes: when nothing is rewritten and any
  off-major row has sites, the summary is
  `nothing to rewrite; <n> line(s) use(s) an API a claimed major removed (see offMajor)`. `textOf`'s
  `on a major that was not graded, left alone` section prints, per host:
  - the host line, with `; nearest claimed <n>` when `nearest` is not null, then either
    `, move <specifier> -> <entry>, …` or `, no move: <n> line(s) below use(s) an API <n> removed`;
  - under it, each site as `<file>:<line>  <api>  removed in <removedIn>; use: <replacement>`,
    with `(first use line <n>)` where there is one.
- **R6 — Every pattern is sourced and true.**
  - (a) **Source shape**, offline: `scripts/migrate-removed-apis-lock.test.ts` holds each row's
    `source` to
    `^https://github\.com/(tj/commander\.js|yargs/yargs)/blob/v\d+\.\d+\.\d+/CHANGELOG\.md#<removedIn without dots>-\d{4}-\d{2}-\d{2}$`,
    each `quote` and `replacement` non-empty, and each `api` named once.
  - (b) **True against the drop-in, at every claimed major.** For each row and each claimed major
    `t` of its host, the entry at `t`, loaded through the package's exports map, serves the API
    exactly when the row says the incumbent still had it at `t` (`removedMajor > t`):
    - `require(entry).version` is a function (`module-as-program`);
    - `new Option('-fe, --resolve-full-extension [ext]')` does not throw (`multi-char-short-flag`);
    - an instance's `rebase`, `reset` and `onFinishCommand` are functions;
    - `require(entry).option` is a function (`singleton`: true at 17, false at 18);
    - `commander/esm.mjs` has an entry. No claimed major serves it, 14 included, so the gate refuses
      it as an unserved specifier (R8), whatever major removed it.

    A row the façade still serves would be a false work item. A major that serves an API the table
    calls gone would make the gate refuse a move that works.
- **R7 — Docs.** `apps/docs/content/docs/migrate.mdx` gains
  `## When your incumbent is on an older major`: what `sites`, `nearest` and `move` mean; that
  nothing is rewritten; that the move is checked against the table's seven APIs and graded at
  `nearest`, not at the project's major; and the table with each source. It also says that `bin`
  files are read. The R6a lock checks that each `api`, with its host, release and source, is on
  that page.
- **R8 — The gate: a move only where nothing is in its way.** `moveOf(found, claimed, sites,
  unserved)` returns `nearest`, or nothing:
  - nothing when there is no claimed major above `found`;
  - nothing when any site's API was removed at or before `nearest`;
  - nothing when the project imports a specifier of the host with no entry (`MAPPING` has none:
    `commander/esm.mjs`, a deep import);
  - otherwise `nearest`.

  `nearest` is the only candidate, because an API stays removed once it is: a larger claimed
  major can only lack more. The move is printed, never applied (R5).

## Design

`migrate-majors.ts` is a sibling of `migrate-guided.ts` and follows its contract: nothing in it
imports `migrate.ts`, and `migrate.ts` lexes and calls in. It takes the `Token` type from
`migrate-guided.ts`. It receives the façade export lists and the highest claimed majors as
arguments, so the dependency runs in one direction. The detection is a token walk with no parser
(D-050).

In `migrate.ts`:

- `majorsOf` fills `nearest` (and empty `sites`, `null` `move`) on each off-major row.
- `olderOf` maps each off-major row whose host has table rows to its found major. That map rides
  in `Plan` as `older`.
- `rewriteFile` also returns `specifiers`, every incumbent specifier the file names, deep ones
  included. `scanBatch` keeps it, and runs `removedSites` over a file whose `seen` names an
  `older` host.
- After the scan, `withSites` fills each row's `sites` and decides its `move` through `moveOf`.
- `binsOf(dir, manifest.bin, sources)` adds R1's files to the walk.

### Order

One PR. #1086, #1165, `migrate-pins-carry-the-drop-in` (#1124), `migrate-preflight` (#1168) and
`migrate-dynamic-specifiers` (#1172) have all landed, so the build waits on nothing.

## Verification

The loop is `npx vitest run src/migrate-majors.test.ts src/migrate.test.ts src/migrate-u12.test.ts src/migrate-bench.test.ts`
in `packages/burgee`, plus `npx vitest run --config vitest.root.config.ts scripts/migrate-removed-apis-lock.test.ts`
at the root. Each new case is shown red on `main` first.

The fixtures are the trial's four crashes, cut down, with every line at its number at the pinned
SHA. Each has a `package.json` with the declared range and a `node_modules/<host>/package.json`
with the installed version from the trial's `offMajor.found`.

| Fixture | Shape |
| :-- | :-- |
| wait-port `16083537` | commander `^9.3.0`, installed 9.4.0, `bin: { 'wait-port': './bin/wait-port.js' }`. `bin/wait-port.js`: line 4 `const program = require('commander');`, line 12 `program`, line 13 `  .version(pkg.version)` |
| madge `456057b8` | commander `^7.2.0`, installed 7.2.0. `bin/cli.js`: line 6 `const program = require('commander');`, line 14 `program.storeOptionsAsProperties();` |
| tsc-alias `1077308b` | commander `^9.0.0`, installed 9.5.0. `src/bin/index.ts`: line 2 `import { Option, program } from 'commander';`, line 21 `  .addOption(`, line 22 `    new Option(`, line 23 `      '-fe, --resolve-full-extension [ext]',` |
| node-qrcode `3848ed2c` | yargs `^15.3.1`, installed 15.4.1, `bin: { qrcode: './bin/qrcode' }`. `bin/qrcode` (no extension): line 2 `var yargs = require('yargs')`, line 48 `    yargs.showHelp()`, line 59 `var argv = yargs`, line 60 `  .detectLocale(false)` |

| R | Check: file › test name | Shown failing first by |
| :-- | :-- | :-- |
| R1 | `migrate.test.ts` › `A1 — scans an extensionless bin that package.json names, and rewrites it on a claimed major` | the bin is unread: unchanged, `imported` is `[]` |
| R1 | `migrate.test.ts` › `A1 — reads a bin given as a string, …`; `A1 — counts a bin the walk already found once, …` | the bin is unread |
| R1 | `migrate.test.ts` › `A1 — ignores a bin path that is %s` (7 cases) | written first; each names a file that would import chalk if read |
| R2, R6a, R7 | `scripts/migrate-removed-apis-lock.test.ts` (9 cases) | the module does not exist |
| R6b | `migrate-majors.test.ts` › `%s on %s %i: served is %s` (14 cases) | the module does not exist |
| R3, R4, R8 | `migrate-majors.test.ts` › `wait-port: names line 4, …`, `madge: …`, `tsc-alias: …`, `qrcode: …` | `sites`, `nearest` and `move` absent; qrcode's bin unread |
| R3 | `… does not report %s` (14 cases); `… reports %s` (8 cases); `… only in a file that imports it`; `… after the found major and at or before the highest claimed one` | the module does not exist |
| R4, R8 | `… the move` (7 cases: 17's two entries and helpers, commander 13 to v14, `esm.mjs` and a deep import, no table, above the highest, `nearestOf`, `moveOf`) | `nearest` and `move` absent |
| R5 | `… changes no file and no exit code` | written first: the "no rewrite without a grade" mutation |
| R4 | `… a project on a claimed major gets no off-major row` | written first: intent criterion 2 |
| R5 | `migrate-majors.test.ts` › `prints each site under its incumbent, …`; `migrate-u12.test.ts` › `renders every section a report can carry` (extended with four rows) | the summary is `nothing to rewrite`; no site line |
| R4 | `migrate.test.ts` › the four existing `offMajor` assertions, now with `nearest`, `sites` and `move` | the fields are absent |
| all | `migrate-bench.test.ts` (A10) | stays inside its budget: the second pass runs only on files naming an off-major host with a table |
| R8 | [`majors.qnt`](./majors.qnt) `safety`, under `step` | holds over 20,000 traces; each rejected design (below) violates it |

**The field re-run** (intent criterion 3) is evidence for the PR, not a unit test. Run the
branch's built `dist/cli.js migrate --dry-run --json` on the clones at their SHAs, and record before
and after. Where it prints a move, apply it, install, and run the CLI's `--help`. A crash is a
failure.

## Constraints

- **Zero runtime dependencies, no AST library.** The token stream comes from `tokensOf`.
- **No rewrite without a grade.** R5 is held by a byte-identical test. The move is printed.
- **Every pattern is sourced** (R6a), and true against the drop-in at every claimed major (R6b).
- **Offline.** The source URLs are data. The lock checks their shape and never fetches them.
- Hooks are the gate: no `--no-verify`.

## Weight and budget

- **Entry budgets: none move.** `migrate-majors.js` is reached only through `migrate.js`, which is
  dynamically imported.
- **burgee tarball.** Measured with `npm pack --dry-run` against `main`'s; `check:artifacts` gates
  it. If it trips, a dated re-baseline decision is made under the 2026-10-12 delegation. Do not cut
  sourced rows to fit.
- **A10.** The extra `tokensOf` pass runs only on files that name an off-major host with a table.

## Compatibility

- `--json` gains `offMajor[].sites`, `offMajor[].nearest` and `offMajor[].move`. This is additive.
- **R1 widens what migrate reads and rewrites.** A bin with no extension on a claimed major is now
  rewritten. It was skipped before, which left it importing an incumbent that `next` then told the
  maintainer to uninstall. The changeset (`minor`, `burgee`) says so.
- The summary of an off-major run with sites gains a clause after `nothing to rewrite`.
- The façades and grades are unchanged.

## Quint model: needed? Yes

The staged spec said no, because detection is a pure function. That was before the move. Whether a
printed move crashes is a property of the whole run: the sites come from every file, in any order,
and the gate decides once, from all of them. The model is [`majors.qnt`](./majors.qnt): two files,
two APIs, every combination of claimed majors, found major, removal majors, uses and unserved
specifiers. Its `safety` is the conjunction of two properties:

- `moveNeverCrashes`: a printed move targets a claimed major above the found one, whose entry has
  every API the project uses and serves every specifier it imports;
- `moveWhenOneIsSafe`: once decided, if some claimed major above the found one is safe, a move is
  printed. So the gate cannot pass by refusing everything.

The rejected designs are steps, and `models.yml` requires each to violate `safety`:

| Step | The design it is | Why it fails |
| :-- | :-- | :-- |
| `stepUnchecked` | a move to the nearest claimed major, whatever the sites say | wait-port to v14 crashes on `program.version` |
| `stepOffByOne` | an API removed in exactly the target major does not block it | `reset` (17) passes a move to 17 |
| `stepLatest` | the highest claimed major, checked | the field trial's own move: qrcode to 18 is refused while 17 is safe |
| `stepEager` | the move decided when the first file is scanned | a site in the second file is missed |
| `stepNoDeep` | a specifier with no entry does not block | `commander/esm.mjs` moves to v14, where it does not resolve |

A witness, `neverMoves`, is also required to be violated: some run prints a move, the qrcode shape.

## Rejected alternatives

- **A separate `eslint-plugin-cli-floor` rule as the only home.** Rejected by the intent. A lint
  rule can later project from `REMOVED_APIS`.
- **Apply the move.** It would rewrite a project onto an entry graded at `nearest`, not at the major
  it is on: yargs 16 and 17 changed behaviour that does not crash at start-up (coerce order, async
  `parse`). That is a rewrite without a grade, which D-145 and the intent forbid. The move is a line
  to act on.
- **Move to the current entry, as the trial did.** `stepLatest` is that design, checked: it refuses
  qrcode a move that 17 serves.
- **Print `nearest` and no move.** The coordinator's field findings ask for the pinned subpath where
  a supported older major exists. Without the gate, `nearest` alone reads as an invitation that
  crashes three of the four.
- **A move for every off-major host.** chalk 4 to 6 removed `chalk.keyword`, and no table here says
  so. A move nothing checked is the trial's crash again, so only hosts with table rows get one.
- **Cite the research doc's "`storeOptionsAsProperties` removed in commander 13".** commander's
  CHANGELOG through 15.0.0 removes no such method, and burgee's `Command.storeOptionsAsProperties`
  exists (`commander/command.ts`). madge crashes on it because `program` is the module, not a
  Command: that is `module-as-program`. The research doc is corrected in the same PR.
- **Report every member use of a whole-module binding.** madge would get dozens of lines for a
  one-line fix. One site per binding, with `firstUse`, is the work item.
- **Detect excess-argument errors (13.0.0) and duplicate flags (12.0.0).** Both depend on runtime
  argv, or on which command a flag belongs to. A token scan would report false work.
- **No Quint model.** See above.

## Out of scope

- Commander 6 and older, and yargs 14 and older, as table rows of their own. Their projects get
  `sites` for the seven APIs above; a pattern only they used follows when a measured project needs it.
- Behaviour changes that do not crash at start-up: commander 13's excess-arguments error, 12's
  duplicate-flag and duplicate-command throws, `storeOptionsAsProperties` ordering throws,
  `Help.wrap()` (13.0.0), and yargs 17's async `parse` and coerce order. The docs say the move is
  graded at `nearest`, so these are the maintainer's to read in the incumbent's changelog.
- `import * as B from 'yargs'` as a singleton binding.
- The types of older majors (`extra-typings-drop-in`).
- Tables for incumbents other than commander and yargs.

## Re-grounded 2026-10-19

Against `main` at `326907eca6`:

- **Prerequisites.** #1086 (commander 14) and #1165 (yargs 17) landed, with `SUPPORTED_MAJORS`
  `commander: [14, 15]` and `yargs: [17, 18]`, and `PREVIOUS_MAJOR_ENTRIES` naming
  `burgee/commander/v14`, `burgee/yargs/v17` and `burgee/yargs/v17/yargs`. #1168 and #1172 landed
  in `migrate.ts`. Order is now one PR.
- **Names and positions.** `majorsOf` (the staged spec's `offMajorOf`), `scanBatch`, `Scanned`,
  `rewriteFile`, `summaryOf` and `textOf` are where this spec names them. `Plan` gained `entries`
  in #1086, and gains `older` here. `tokensOf` and `FACADE_EXPORTS` are unchanged.
- **Changed by this re-grounding:**
  - **R8 is new: the move.** The coordinator's field findings ask that where a supported older
    major exists, the report pin its subpath, and where none is safe, say exactly which removed API
    breaks and never print a move that crashes. `move` is added to R4, the gate is R8, and R5 prints
    both.
  - **`nearest` is for every off-major row**, not only hosts with a table: it is a fact about
    `SUPPORTED_MAJORS`. `move` is only for hosts with a table.
  - **R3 takes `claimed`** as an argument and filters by it, so `migrate-majors.ts` reads no table
    of majors itself.
  - **R3 reads default imports for commander too.** A TypeScript CommonJS build of
    `import program from 'commander'` is `require('commander')`, the same crash. The staged spec
    read them for yargs alone, and only when the found major was 16 or below. Every off-major yargs
    is 16 or below now that 17 is claimed, so the condition is dropped.
  - **R3 reads a destructured whole module.** `const { argv } = require('yargs')` is the singleton,
    and so is a destructured `version` of commander's module. A destructured name the façade exports
    (`{ program }`) is still not a site.
  - **R6b runs at every claimed major, both ways.** The staged probes checked that each API fails
    on the current entry. The gate needs more: that an API the table says 17 still has is served by
    17's entry (`require('burgee/yargs/v17').option`). `commander/esm.mjs` is not served at 14
    although commander 14 had it, so the gate treats it as an unserved specifier.
  - **R1 skips absolute paths and non-source extensions**, and normalises the path first.
  - **The `on-finish-command` quote** is the changelog's line, verbatim, where the staged table
    paraphrased it.
  - **A Quint model is added**, with five rejected designs as steps.
  - **The fixtures keep every line at its number**, and wait-port's carries its `bin` map.

  Each change is under *Rejected alternatives* or *Out of scope* with its reason.

## Open questions

None. The intent fixed how far back and where the list lives; the move and its gate are stated
above with their reasons.

## Build status

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | Built | `migrate.ts` (`binsOf`, `migrate()`) | `migrate.test.ts` › A1 (10 cases) |
| R2 | Built | `migrate-majors.ts` (`REMOVED_APIS`) | `scripts/migrate-removed-apis-lock.test.ts` |
| R3 | Built | `migrate-majors.ts` (`removedSites`) | `migrate-majors.test.ts` (four fixtures, 24 detection cases) |
| R4 | Built | `migrate.ts` (`OffMajor`, `majorsOf`, `olderOf`, `withSites`, `scanBatch`, `rewriteFile`) | `migrate-majors.test.ts`; `migrate.test.ts` |
| R5 | Built | `migrate.ts` (`summaryOf`, `offMajorLines`, `textOf`) | `migrate-majors.test.ts`; `migrate-u12.test.ts` |
| R6 | Built | the lock and the probes | `scripts/migrate-removed-apis-lock.test.ts`; `migrate-majors.test.ts` |
| R7 | Built | `apps/docs/content/docs/migrate.mdx` | the R6a lock |
| R8 | Built | `migrate-majors.ts` (`moveOf`, `nearestOf`); `migrate.ts` (`withSites`) | `migrate-majors.test.ts` › the move; `majors.qnt` |

**Built: 8. Not built: 0.** The evidence for each, red-first, mutation, A10, weight and the field
re-run, is below once measured.
