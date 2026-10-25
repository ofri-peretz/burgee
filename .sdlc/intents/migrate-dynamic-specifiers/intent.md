# Intent — a non-literal specifier holds only what it could load

**Status:** shipped · **Opened:** `2026-10-18` · **Owner:** `@ofri-peretz` · **Shipped:** 2026-10-25 on
[`23242c0bfc`](https://github.com/ofri-peretz/burgee/commit/23242c0bfc) (#1172), released in burgee 1.7.0 (npm, 2026-10-25T17:05Z, Version PR #1231), verified against `main` at
[`aff0c31f`](https://github.com/ofri-peretz/burgee/commit/aff0c31fdf) with burgee 1.7.1 from npm — both criteria held by `migrate-dynamic.test.ts` (83 / 83) and re-run on the trial clones · design accepted under the owner's delegation, [`D-20261019-dynamic-specifiers-design-accepted`](../../decisions/D-20261019-dynamic-specifiers-design-accepted.md) · **Design:** [`spec.md`](./spec.md)

---

## What is wanted

A file that loads a module by a computed name stops refusing the whole file, and stops holding
every incumbent that file names. Examples are a plugin loader such as `import(argv.parser)`, or a
config read such as `require(path.join(cwd, 'package.json'))`. Only where the computed name
could resolve to an incumbent does it hold one. The literal imports beside it move as they would
in any other file.

## Why now

The 2026-10-18 field trial, barrier 9 in
[`adoption-barriers-2026-10.md`](../../research/adoption-barriers-2026-10.md). 3 of the 9 real
CLIs ran partial:

- **postcss-cli** at `03e8cee3`. Four `import(argv.parser | syntax | stringifier | plugin)` lines
  refused `index.js`, which held `picocolors` in the whole project. Those lines load the user's
  PostCSS plugins and can never load picocolors.
- **madge** at `456057b8`. `require(path.join(process.cwd(), 'package.json'))` refused
  `bin/cli.js`. It reads a JSON file.
- **nest-cli** at `08d8f3c9` had a different cause, a type export the cli-table3 drop-in lacks.
  That one belongs to [`output-stack-compat`](../output-stack-compat/intent.md), not here.

Plugin loaders and config readers are common in CLIs. Each one turns a `complete` run into
`partial` with exit 1. An agent reading the exit code then treats the migration as failed.

## Affected users and systems

- `packages/burgee/src/migrate.ts`: the `non-literal-specifier` refusal, and the `held` rules from
  U12-4 ([`D-20261008-migrate-u12-findings`](../../decisions/D-20261008-migrate-u12-findings.md)).

## Constraints

- **U12-4 stands.** An incumbent still moves in every file or in none. This intent only narrows
  what counts as a file that names it.
- **The token scanner only.** No data-flow analysis. The rule is decided from the call's shape,
  for example "the argument is built from `path.join` or `process.cwd()`, or the call sits in a
  loader that never names an incumbent".
- **A computed name that could be an incumbent still holds it.** Correctness over coverage.

## Success criteria

- The postcss-cli shape: picocolors moves, and the run is `complete`. The madge shape: the file
  moves. Both tests fail on the code before the change.
- `import(name)` where `name` is built from a string that names an incumbent still holds that
  incumbent.

## Scope, decided here

- **A heuristic, with a narrow list.** Three shapes stop holding: an argument built by
  `path.join` or `path.resolve` from `process.cwd()` or `__dirname`; a member of a parsed argv
  object (`argv.x`, `options.x`); and an element of an array that came from argv. Every other
  non-literal specifier is refused exactly as it is today. Rejected: an `--allow-dynamic <file>`
  flag, which pushes onto every maintainer a call the scanner can make for the common shapes.

## Open questions

None.

## Shipped — 2026-10-25

`burgee@1.7.0` is on npm (`"1.7.0":` `2026-10-25T17:05:01.964Z`, release run 40213249288), and its
changelog carries #1172 as a minor. npm matches `main` for all ten packages (checked 18:26 UTC).
Every criterion was re-read against the released code:

| Criterion | Evidence on release |
| :-- | :-- |
| 1. The postcss-cli shape: picocolors moves, and the run is `complete`. The madge shape: the file moves. Both tests fail on the code before the change | `burgee@1.7.1`'s `dist/cli.js` from npm on a postcss-cli clone at `03e8cee3`, `migrate --dry-run --json`: `complete: 2 files would be rewritten`, `mapped` holds `yargs -> burgee/yargs` and `picocolors -> roundel/picocolors`, `dynamic` lists `index.js` 69, 70 and 71 as `argv-member` and 77 as `argv-element`, `held: []`, exit 0. madge at `456057b8` was re-run the same way: `bin/cli.js:63` is listed as `cwd-path` and refuses nothing; the run is then blocked by `require-esm`, which is migrate-preflight's barrier, not this one (spec, *Field check*). `migrate-dynamic.test.ts` **83 / 83** on `main` at `aff0c31f`; 79 of its cases were red on `main` before #1172 (spec, *Build status*). |
| 2. `import(name)` built from a string that names an incumbent still holds that incumbent | `the incumbent the string names is held in every file …` and `a file that imports no incumbent …`, both red on the code before #1172 and passing on `main`. |
