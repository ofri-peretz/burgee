# Design — a non-literal specifier holds only what it could load

Intent: [`intent.md`](./intent.md). **Status:** approved — accepted by the coordinator under the
owner's 2026-10-12 delegation,
[`D-20261019-migrate-dynamic-specifiers-design-accepted`](../../decisions/D-20261019-migrate-dynamic-specifiers-design-accepted.md).

Staged on 2026-10-18 against `main` at `1013b65db5`; **re-grounded on 2026-10-19 against `main`
at `1dcf064a03`**, after `migrate-preflight` (#1168) changed `migrate.ts`. What moved, and what
this spec changed because of it, is under [Re-grounded](#re-grounded-2026-10-19). Evidence:
barrier 9 in [`adoption-barriers-2026-10.md`](../../research/adoption-barriers-2026-10.md).
[`field-trial.json`](../../research/adoption-barriers/field-trial.json) records two runs:

- postcss-cli `mig`: `refused: index.js:69, 70, 71, 77 non-literal-specifier`;
  `held: picocolors (refused)`; exit 1.
- madge `mig`: `refused: bin/cli.js:63 non-literal-specifier`; `held: rc (refused)`; exit 1.

The source lines were read at the pinned SHAs for this spec.

---

## Today, on `main`

`scan()` in `packages/burgee/src/migrate.ts` decides A4 in `push()`. When the token after
`import (` or `require (` is neither a quoted literal nor `)`, it pushes the line into
`Tokens.nonLiteral`. `rewriteFile` then refuses the whole file (`non-literal-specifier`), but only
in a file that imports an incumbent the run moves (`hits`). U12-4's `heldBy` then holds every
incumbent the file imports (`retained`), in every file. The decision reads only the first token
after the `(`.

Two gaps were found while re-grounding, and both are closed here:

- **`import(str)` is read as a literal.** The lexer records a quoted literal as the token `str`, so
  an identifier named `str` is indistinguishable from one, and `import(str)` is not refused.
- **A computed name holds only what its file imports.** `const name = 'chalk'; await import(name)`
  in a file that imports no incumbent is not refused at all, and in one that imports `picocolors`
  it holds `picocolors` and not `chalk`. Either way `chalk` moves in the next file while this line
  can still load the incumbent: two copies, which is what U12-4 exists to prevent. This is the
  intent's second success criterion, and it does not hold on `main`.

## Requirements

- **R1 — A path built from the working directory passes.** `require(…)` or `import(…)` whose
  argument is `path.join(` or `path.resolve(`, followed by the arguments below, is not refused. The
  first argument is `process.cwd()` or `__dirname`. Every later argument is a quoted literal.
  Literally, the token sequence inside the call's parentheses is:

  `path . (join|resolve) ( (process . cwd ( ) | __dirname) (, str)* )`

  Example: madge `bin/cli.js:63`, `require(path.join(process.cwd(), 'package.json'))`.
- **R2 — A member of a parsed argv object passes.** `import(N.x)` or `require(N.x)`, where the whole
  argument is exactly `N . <identifier>` and `N` is one of `argv`, `args`, `options`, `opts` or
  `flags`, is not refused. Examples: postcss-cli `index.js:69–71`, `await import(argv.parser)`,
  `argv.syntax`, `argv.stringifier`.
- **R3 — An element of an array that came from argv passes.** `import(P)` or `require(P)`, where the
  whole argument is the identifier `P`, is not refused when `P` was bound earlier in the same file as
  the first parameter of a callback passed to `N . <identifier> . (map|forEach|flatMap|filter) (`,
  with `N` from R2's list. The callback may be written as `P =>`, `(P) =>`, `async P =>`,
  `async (P) =>`, `function (P)` or `async function (P)`. `function name (P)` binds nothing.
  Example: postcss-cli `index.js:75` binds `plugin` in `argv.use.map(async (plugin) => {`, and
  `index.js:77` is `(await import(plugin)).default()`.
- **R4 — A string that names an incumbent holds it.** Take every string, template and regular
  expression in the file outside a specifier position, in a file that has a computed specifier.
  When one of them names an incumbent this run moves:
  - R1–R3 do not apply in that file, and every computed specifier in it is refused exactly as today;
  - the file holds that incumbent as well as the ones it imports, so it moves in no file (U12-4);
  - the file is refused even when it imports no incumbent itself.

  Details:
  - "Names an incumbent" means the literal's text, cut at `/`, `\`, quotes, `$` and `}`, has a
    piece equal to a `HOSTS` name, or two consecutive pieces equal to a scoped one. So
    `node_modules/chalk`, `C:\deps\chalk` and `` `${dir}/chalk` `` name chalk, and
    `chalk-template` does not.
  - Specifier positions are the five A3 positions, plus the `CALLS` first argument that
    `isSpecifier` recognises.
  - An incumbent the run does not move (undeclared, off-major, `--skip`, or already held) cannot
    split, so it guards nothing.

  This is how "a computed name built from a string that names an incumbent still holds it" is kept
  without data flow. `const name = 'chalk'; await import(argv.x)`,
  `require(path.join(__dirname, 'node_modules', 'chalk'))` and
  `const name = 'chalk'; await import(name)` each refuse the file and hold chalk.
- **R5 — Everything else is unchanged.** Any other non-literal specifier is refused as today, with the
  same `Refusal` (`reason: 'non-literal-specifier'`, `specifier: ''`, its line). That covers
  `import(name)`, a template, `require(a + b)`, `import(argv[x])`, `require(join(cwd, x))` without the
  `path.` receiver, `path.join(base, …)`, `import(cfg.plugin)`, a call nested inside the argument, and
  a call the file never closes. `import(str)` is now refused too. The existing `migrate.test.ts` › A4
  non-literal cases stay green unedited.
- **R6 — Passed sites are reported, not silent.** `MigrationReport` gains
  `dynamic: { file: string; line: number; shape: 'cwd-path' | 'argv-member' | 'argv-element' }[]`,
  after `refused`, always present. `textOf` prints a section,
  `read as not an incumbent (a computed specifier)`, after the refusals, one `file:line  shape` per
  entry. A passed site is never a refusal, never holds, and never changes `exitCode`. A file
  refused for another reason (a deep import, say) still lists its passed sites.

## Design

**Scanner.** In `Tokens` (`migrate.ts`), the single-token decision becomes a short capture:

- Where `push()` finds `pending` and the token is not `str` or `)`, `capture()` starts
  `computed = { line, depth: 1, seq: [] }`.
- Each token is appended, counting `(` and `)`, until the call's own `)` brings `depth` to 0.
- Then `shapeOf(seq)` returns a shape or `undefined`. `undefined` pushes the line to `nonLiteral`,
  as today. A shape pushes `{ line, shape }` to a new `Scan.dynamic`. R1 and R2 are each one regular
  expression over the tokens joined by a space; R3 is a set lookup.
- A second computed call opened inside a capture is refused at once, and the outer one fails every
  shape. A capture still open at the end of the file is refused.

A capture is bounded by its own parentheses, so it costs O(tokens), and A10 is unchanged.

**The literal token.** `QUOTED` becomes `'`, a character no word or punctuation token can be, so an
identifier named `str` is a name again. `DIVIDES` gains `QUOTED`, so a `/` after a string still
divides. `bindingsOf`'s `name !== QUOTED` test is deleted: `WORD` already rejects `'`. A binding
spelled `{ str }` is now checked against the façade, as every other name is.

**R3's bindings.** `Tokens` gains a fifth named slot, `fifth`, beside the four it has. When a `(`
arrives with `fifth . third . previous` matching `N . x . (map|forEach|flatMap|filter)`, the callback
state becomes `open`. A four-state machine, `CALLBACK`, keyed `"<state> <token>"`, steps over
`async`, `function` and `(`. The first name reached in `open`, `async` or `paren` is added to a
per-file `elements` set; any other token ends the walk. In `fn`, the next token must be `(`, so
`function name (p)` binds nothing. The set is file-wide and unscoped. A shadowing `plugin` elsewhere
in the same file is accepted as a known limit (see Rejected alternatives).

**R4's guard.** `scan()` returns `named`: every incumbent the file's non-specifier literals name. It
is read by a second pass of the same lexer, run only over a file whose first pass found a computed
specifier, so a file without one pays nothing (A10). `rewriteFile` keeps the names the run moves,
`loadable`.

- When `loadable` is not empty, the file's passed sites are moved back into its refusals.
- `retained`, what a refused file holds, becomes its hits plus `loadable`.
- The early `hits.length === 0` return no longer skips a file with `loadable`.

Nothing in `heldBy`, `classify` or `crossing` changes. U12-4 stands: an incumbent moves in every
file or in none.

**Report.** `rewriteFile` returns `dynamic` on a relevant file. `migrate()` flattens it from the
first pass with `file`, as it does `refused`.

### Order

One PR. `migrate-pins-carry-the-drop-in` (#1124) and `migrate-preflight` (#1168) have both landed,
so the build waits on nothing. `migrate-older-majors` comes after this, in the same file.

## Verification

The loop is `npx vitest run src/migrate-dynamic.test.ts src/migrate.test.ts src/migrate-lexer.test.ts src/migrate-u12.test.ts src/migrate-bench.test.ts`
in `packages/burgee`. Each new case is red on `main` first. The postcss-cli and madge shapes come
back `partial` with exit 1. The R4 holds come back with chalk moved. `report.dynamic` is `undefined`.

The fixtures are the trial's lines, cut down. Line numbers are preserved by padding with blank lines, and each line keeps its indentation, shown here without it.

| Fixture | Shape |
| :-- | :-- |
| postcss-cli `03e8cee3` | `{ type: 'module', dependencies: { picocolors: '^1.1.1', yargs: '^18.0.0' } }`. `index.js`: line 7 `import pc from 'picocolors'`; line 16 `import argv from './lib/args.js'`; lines 69–71 `parser: argv.parser ? await import(argv.parser) : undefined,` and the `syntax` and `stringifier` twins; line 75 `argv.use.map(async (plugin) => {`; line 77 `return (await import(plugin)).default()`; line 79, its template naming `${plugin}` |
| madge `456057b8` | `{ dependencies: { commander: '^7.2.0', rc: '^1.2.8' } }` with `node_modules/commander/package.json` at 7.2.0. `bin/cli.js`: line 4 `const path = require('path');`; line 6 `const program = require('commander');`; line 7 `const rc = require('rc')('madge');`; line 63 `packageConfig = require(path.join(process.cwd(), 'package.json')).madge;` |

| R | Check: `packages/burgee/src/migrate-dynamic.test.ts` (new) › test name | Shown failing first by |
| :-- | :-- | :-- |
| R2, R3, R6 | `the postcss-cli shape: picocolors moves, the run is complete, and the four computed imports are listed` | `refused` holds lines 69, 70, 71 and 77 |
| R1, R6 | `the madge shape: the file moves, and line 63 is read as a cwd path` | `refused` holds `bin/cli.js:63` |
| R1–R3 | `… passes as cwd-path / argv-member` (7 cases); `an argv element bound by … passes` (6 cases) | `refused` is not `[]` |
| R3 | `a P bound by … does not pass` (11 cases); `the words a callback opens with are not bound`; `an element is bound from its callback on` | `dynamic` is `undefined` |
| R4 | `… refuses` (11 cases: a string, a path, a scoped name, a template, a backslash path, a string after the site); `… names no incumbent, so the computed import still passes` (5 cases) | `dynamic` is `undefined` |
| R4 | `the incumbent the string names is held in every file, beside the ones the refused file imports (intent criterion 2)` | `held` is picocolors alone, and chalk moves in `b.js` |
| R4 | `a file that imports no incumbent, and builds a computed name from a string that names one, is refused and holds it` | `refused` is `[]`, and chalk moves |
| R4 | `a string that names an incumbent the run does not move guards nothing`; `… in a file with no computed specifier, holds nothing` | `dynamic` is `undefined` |
| R5 | `… is refused` (23 cases, `import(str)` among them); `a computed import the file never closes …`; `a literal specifier is still a literal …` | `import(str)`: `refused` is `[]`; the rest, `dynamic` is `undefined` |
| R5 | `migrate.test.ts` › `A4 — refuses a dynamic specifier that is not a literal` and `… a template specifier …` | unchanged, green before and after |
| R6 | `migrate-u12.test.ts` › `renders every section a report can carry` (extended with one `dynamic` entry); `migrate.test.ts` › the report's key list | no section printed; no `dynamic` key |
| all | `migrate-bench.test.ts` (A10: 1,000 files) | stays inside its budget |
| model | [`dynamic.qnt`](./dynamic.qnt) `safety`, under `step` | holds over 20,000 traces; each rejected design (below) violates it |

## Constraints

- **U12-4 stands.** An incumbent moves in every file or in none. Only the definition of a refused
  file narrows, and R4 widens what a refused file holds.
- **The token scanner only.** There is no data flow. Each rule is decided by the call's shape, and R4
  by a file-wide literal check (D-050).
- **One assumption, stated.** A computed name is built from the literals in its own file, or from the
  user's command line. A name built from a string in *another* file reaches the scanner in neither
  form. The model makes the same assumption (`couldLoad`), and Out of scope names the case.
- **Correctness over coverage.** When R4 cannot rule an incumbent out, the file refuses as today and
  holds it.
- **Zero dependencies, offline.** Hooks are the gate: no `--no-verify`.

## Weight and budget

- **Entry budgets: none move.** The change is in `migrate.js`, which is dynamically imported.
- **burgee tarball.** About +2 KB unpacked and a few hundred bytes gzipped. Measure with
  `npm pack --dry-run` against `main`'s; `check:artifacts` gates it. If it trips, a dated re-baseline
  decision is made under the 2026-10-12 delegation.
- **A10.** The capture is linear and bounded by the call's parentheses. The R4 pass runs only over a
  file with a computed specifier. `migrate-bench.test.ts` is the check.

## Compatibility

- `--json` gains `dynamic`. This is additive.
- **Behaviour.** Files with these three shapes now move, and runs that were `partial` with exit 1 can
  become `complete` with exit 0. That is the intended change.
- **Behaviour, the other way.** A file that builds a computed name beside a string naming a moved
  incumbent is now refused and holds it, where `main` moved that incumbent elsewhere and left two
  copies. A run that was `complete` can become `partial`. That is R4, and it is a fix.
- The `burgee` changeset is a `minor`. The façades and grades are untouched.

## Quint model: needed? Yes

The staged spec said no, because the classifier is a pure function. That was the wrong question.
Whether a computed specifier holds an incumbent is a safety property of the whole run: it decides
what U12-4 holds across files, and the run scans every file before it holds or writes any. The model
is [`dynamic.qnt`](./dynamic.qnt): two files, two incumbents, every combination of imports, named
strings, computed shape and other refusal. Its `safety` is the conjunction of three properties:

- no incumbent a computed name could load moves in any file;
- U12-4's all-or-nothing;
- a refused file is left untouched.

The rejected designs are steps, and `models.yml` requires each to violate `safety`:

| Step | The design it is | Why it fails |
| :-- | :-- | :-- |
| `stepNoGuard` | R4 dropped | a shape beside `'chalk'` passes, and chalk moves |
| `stepWide` | classify widened to any computed specifier | `import(name)` passes |
| `stepImportsOnly` | the staged spec's R4: refuse, but hold only what the file imports | `const name = 'chalk'; import(argv.x)` in a file importing nothing lets chalk move next door |
| `stepEager` | write each file as it is scanned (before U12) | a later refusal holds what was already moved |

A witness, `passedNeverMoves`, is also required to be violated: some run moves the imports of a file
whose computed specifier passed, the postcss-cli shape. So `safety` does not hold just because
nothing moves.

## Rejected alternatives

- **An `--allow-dynamic <file>` flag.** Rejected by the intent. It pushes onto every maintainer a call
  the scanner can make for the common shapes.
- **Data flow, to find where `name` was assigned.** That is an AST or an interpreter, which D-050
  rules out, and it still cannot see argv values.
- **Refuse the file, and hold only what it imports.** This was the staged spec's R4. It keeps the
  file whole and still moves the incumbent the string names in every other file, which is the split
  U12-4 exists to prevent. `stepImportsOnly` is its counterexample.
- **Hold only the incumbent a guarded literal names, instead of refusing the file.** It would be
  finer. But it would need the scanner to tie a literal to a particular computed site, and that is
  data flow again. Refusing is a superset hold, so it is correct.
- **Guard on every incumbent, moved or not.** One the run does not move cannot split. Guarding on it
  would refuse postcss-cli-shaped files for a `'chalk'` in an error message in a project with no
  chalk.
- **Guard on quoted strings only.** The staged spec did, so `` `${dir}/chalk` `` passed. Templates
  and regular expressions are read too.
- **Read the literals in the first pass.** It measured about 2% of the scan on the A10 tree, for
  files with nothing to refuse. The second pass runs only where there is.
- **An 8-token `recent` window for R3.** The staged design took "the next identifier that is not
  `async`, `function` or `(`", which binds the name of `function plugin (x)`. A fifth slot and a
  four-state walk are smaller and exact.
- **Scope the R3 binding to its function body by brace depth.** A shadowed `plugin` in the same file
  that loads an incumbent would also have to avoid every incumbent literal, because of R4. The guard
  bounds the risk, and depth tracking costs bytes in every file.
- **Accept bare `join(` / `resolve(`.** `resolve` is the most common name for a promise callback.
  Only the `path.` receiver is evidence.
- **No Quint model.** See above.

## Out of scope

- The nest-cli refusal (a `TableConstructorOptions` type export). It belongs to
  [`output-stack-compat`](../output-stack-compat/intent.md).
- `import.meta.resolve`, `createRequire(...)(x)`, and `module.require`. They are not one of the five
  positions today.
- Receivers beyond R2's five names. A new name joins the list only when a measured project needs it.
- **A name built in another file.** For example, `lib/args.js` might give `--parser` a default of
  `'chalk'`, and `index.js` might run `import(argv.parser)`. Neither file has both the string and
  the computed specifier, so neither is guarded. No trial project does this. The intent fixes R2's
  premise that an argv member names the user's own module.

## Re-grounded 2026-10-19

Against `main` at `1dcf064a03`, after #1168:

- **Prerequisites.** `migrate-pins-carry-the-drop-in` (#1124) shipped. `migrate-preflight` (#1168)
  landed in the same file. The staged "after pins" ordering is met, and Order now says so.
- **Names and positions.** `scan`, `push`, `Tokens`, `lex`, `isSpecifier`, `rewriteFile`, `heldBy`
  and `textOf` are where the staged spec named them.
  - `rewriteFile` now also takes `entries`, older majors' own targets. It is untouched here.
  - `MigrationReport` gained `preflight` ahead of the rewrite lists. `dynamic` goes after `refused`,
    and `textOf`'s section goes after the refusals, below "before the move".
  - The report's key-list test in `migrate.test.ts` now has to name `dynamic`. That is added to R6's
    checks.
  - The "files that pass `mentionsAHost`" premise no longer gates refusal: `rewriteFile` refuses on
    `hits`. Today says so.
- **Changed by this re-grounding:**
  - R4 now holds what the string names, and refuses a file that imports nothing. The staged R4 did
    not meet the intent's second criterion. The model's `stepImportsOnly` is its counterexample.
  - R4 guards only on incumbents the run moves.
  - R4 reads templates and regular expressions as well as strings.
  - R4's literals are read in a second pass, for A10.
  - R3 is a fifth slot and a four-state walk instead of an 8-token window, which bound
    `function name`.
  - `QUOTED` becomes `'`, closing `import(str)`.
  - Nested and unclosed captures are refused.
  - A refused file lists its passed sites.
  - A Quint model is added, with four rejected designs as steps.

  Each change is under *Rejected alternatives* with its reason.

## Open questions

None. The intent fixed the three shapes. The choices this spec made are stated above with their
reasons: the R4 hold, the guard's scope, and the R3 walk.

## Build status

Built on `feat/migrate-dynamic-specifiers` against `main` at `1dcf064a03`. Every case in
`migrate-dynamic.test.ts` was red on `main` first (79 cases, the failure line of each is in the PR),
except the four under *the lines it touched*. Those kill mutants on lines this change edited that
were already there, so they pass on `main` by construction. All are green on the branch.

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | Built | `migrate.ts` (`capture`, `shapeOf`, `CWD_PATH`) | `migrate-dynamic.test.ts` › madge; R1–R3 |
| R2 | Built | `migrate.ts` (`ARGV_MEMBER`) | `migrate-dynamic.test.ts` › postcss-cli; R1–R3 |
| R3 | Built | `migrate.ts` (`walk`, `opensACallback`, `CALLBACK`, `Tokens.fifth`, `elements`) | `migrate-dynamic.test.ts` › postcss-cli; R3 cases |
| R4 | Built | `migrate.ts` (`scan`'s `named`, `namedOutsideASpecifier`, `hostsIn`, `rewriteFile`'s `loadable`) | `migrate-dynamic.test.ts` › R4 |
| R5 | Built | `migrate.ts` (`QUOTED`, `capture`) | `migrate-dynamic.test.ts` › R5; `migrate.test.ts` › A4 |
| R6 | Built | `migrate.ts` (`MigrationReport.dynamic`, `migrate()`, `textOf`); `apps/docs/content/docs/migrate.mdx` | `migrate-dynamic.test.ts`; `migrate-u12.test.ts`; `migrate.test.ts` key list |
| model | Built | `dynamic.qnt`; `models.yml` (the four rejected steps, `passedNeverMoves`) | `safety` holds over 20,000 traces; each rejected step violates it |

**Built: 7. Not built: 0.**

### Evidence against the intent's success criteria

| Criterion | Evidence |
| :-- | :-- |
| postcss-cli shape: picocolors moves and the run is `complete`, red before | `the postcss-cli shape …`; red on `1dcf064a03` with `refused` at lines 69, 70, 71 and 77 |
| madge shape: the file moves, red before | `the madge shape …`; red with `refused` at `bin/cli.js:63` |
| `import(name)` built from a string naming an incumbent still holds it | `the incumbent the string names is held in every file …` and `a file that imports no incumbent …`; both red on `main`, where chalk moved in `b.js` |
| field: the trial projects at their pinned SHAs | below |

**Field check, 2026-10-19.** The branch's built `dist/cli.js` and `main`'s were each run with
`migrate --dry-run --json` against clones at the trial SHAs. Nothing was installed: neither
decision reads `node_modules`.

- postcss-cli `03e8cee3`.
  - `main`: `partial: 1 file would be rewritten, 1 refused`, with `index.js` 69, 70, 71 and 77
    refused, picocolors held, and exit 1.
  - Branch: `complete: 2 files would be rewritten`. picocolors moves to `roundel/picocolors` beside
    yargs. `dynamic` lists 69, 70 and 71 as `argv-member` and 77 as `argv-element`. Nothing is held,
    and the exit is 0. The line-79 template naming `${plugin}` guards nothing.
- madge `456057b8`.
  - `main`: `bin/cli.js:63` is refused, rc is held, and the exit is 1.
  - Branch: nothing is refused or held, rc would move to `seniority/rc`, and `dynamic` lists
    `bin/cli.js:63` as `cwd-path`. The run is then `blocked: 1 preflight check`. That is
    `require-esm`, because madge is CommonJS on `engines.node >=18` (migrate-preflight R3), so it
    still exits 1 and writes nothing. That block is correct, and it is a different barrier
    (barrier 2).

**Mutation** (`scripts/mutation.ts changed`): 224 mutants on the changed lines, 223 killed and 1
timed out, so 100% are detected. The first run left 14:

- Two were in `DIVIDES`, one in `CWD_PATH`'s anchor, two in the nested capture, one in the R3 arm,
  and one in `mapped.reverse()`. Each got the case that tells it apart.
- Two were `WORD.test(x.charAt(0))` against `WORD.test(x)`. They were equivalent, because every
  token is a word or one character, so the `charAt` was deleted.
- Five were the slot initialisers, which were equivalent. One annotation covers them.

Three more lines carry an annotation. Each is an A10 guard that skips work whose result is
discarded: the `capture` call, the R3 walk, and the R4 second pass.

**Coverage**: 100% lines, branches, functions and statements on `migrate.ts`.

**A10.** On the 1,000-file bench tree, the best of 15 scans took about 30.4 ms on `main` and 23.5 ms
on the branch, on the same machine, under the same load:

- the capture, the walk and the fifth slot cost about 3%;
- `endOfWord`, which now matches each word with one sticky regular expression instead of one
  `RegExp.test` per character, returned about 25%.

`migrate-bench.test.ts` read 29–30 yardsticks against `main`'s 35–38 on this machine, with a budget
of 40.

**Weight**: against `main` at `1dcf064a03`, the burgee tarball grows by +1,004 B gzipped
(272,644 → 273,648) and +3,651 B unpacked (1,032,556 → 1,036,207). Only `dist/migrate.js` changes
(56,948 → 60,599 B). That is inside `check:artifacts`'s allowance of the recorded 267,600 /
1,016,900, so the ceiling is not raised and no decision is recorded. Entry budgets are unchanged.

**Not yet `shipped`**: every criterion has evidence on the branch. The intent moves to `shipped` once
this is on `main` and released. The change is a `minor`, which the release window holds until about
2026-10-25.
