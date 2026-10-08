---
id: D-20261008-migrate-u12-findings
subject: 'What the U12 trial of burgee migrate found, and how each finding is fixed'
taken: Taken
date: '2026-10-08'
superseded_by: —
---

**Five findings, five fixes, each held by a test that failed on the code before it.**

The source is the U12 trial: a measure-only run of `burgee migrate` on two real CLIs,
[apify/mcpc](https://github.com/apify/mcpc) at `bc6d9e8` and
[guhcostan/mac-cleaner-cli](https://github.com/guhcostan/mac-cleaner-cli) at `725f5e7`. The
trial changed neither project; it recorded what the command did to a copy of each. The fixtures
in `packages/burgee/src/migrate-u12.test.ts` are the trial's shapes cut down to the line that
mattered, not the projects.

## U12-1 — mock calls were not rewritten

- **Found on mcpc.** Its source moved to `roundel/chalk`, but its tests' five
  `vi.mock('chalk', …)` calls stayed on `chalk`, so they mocked a module nothing loaded and 51 of
  its 1261 unit tests failed. Rewriting those five lines by hand restored 1261 / 1261.
- **Fix.** The scanner takes the first argument of `vi.mock`, `vi.doMock`, `vi.unmock`,
  `vi.doUnmock`, `vi.importActual`, `vi.importMock`, `jest.mock`, `jest.doMock`, `jest.unmock`,
  `jest.requireActual`, `jest.requireMock`, `jest.unstable_mockModule` and `require.resolve` as a
  specifier. It decides this from the four tokens in front of the quote, `receiver . method (`,
  using the same token stream that classifies imports. It never matches against the source
  text. Type arguments are counted to their close, and an arrow's `=>` is not a close. So
  `vi.importActual<typeof import('chalk')>('chalk')` moves both of its specifiers.
  `jest.requireActual` and `jest.requireMock` are held to the `require()` shape check. A mock
  whose argument is not a literal is not refused, because it loads nothing into the program.
- **Tests.** `U12-1` in `migrate-u12.test.ts`, with `migrates the mcpc shape: the source and its
  test move together` as the end-to-end case.

## U12-2 — the printed install command was unpinned

- **Found on mac-cleaner.** `next` read `pnpm add burgee flagstaff roundel`. Under the project's
  pnpm `minimumReleaseAge` that installed and saved roundel 0.6.2 (`^0.6.2`), flagstaff 1.0.3
  and burgee 0.15.0. None of those is the version the same report had graded.
- **Fix.** `next` pins each family package to a caret range at the version that carries the
  graded drop-in, such as `roundel@^1.0.0`. The versions are never typed into source. At build
  time, `scripts/family-versions.mjs` writes `dist/family-versions.json` from every published
  `packages/*/package.json`. Run from source, `familyVersions()` reads the same manifests two
  directories up. A peer that is not ours, such as `react-reconciler`, stays unpinned. The report
  gains `releaseAge`, which names the file when the project sets `minimumReleaseAge`
  (`pnpm-workspace.yaml`) or `minimum-release-age` (`.npmrc`, `npmrc`): a graded version younger
  than that will not install. Turbo cannot serve a stale copy, because `package-lock.json` is a
  global turbo dependency and records every workspace version.
- **Tests.** `U12-2` in `migrate-u12.test.ts`, and in `migrate-cli.test.ts` `wrote
  family-versions.json beside migrate.js, equal to every published manifest in this repository`.

## U12-3 — no way to choose libraries, and undeclared ones were rewritten

- **Found on mac-cleaner.** It never declared `@inquirer/core`, which it gets through
  `@inquirer/checkbox` and `@inquirer/confirm`. migrate still rewrote it, and added caique to the
  install line.
- **Fix.** New `--only <lib,…>` and `--skip <lib,…>` flags take incumbent package names
  (`multiple`, comma-split). They are in the manifest, so they also reach `--help`,
  `--help --json`, `--schema` and MCP. The names are checked in `migrate.js` rather than as
  `choices`, so the incumbent list stays out of the `./cli` weight. An unknown name is
  `UnknownIncumbentError`, exit 2 (USAGE), and its `fix` lists the valid names. By default the
  command moves only incumbents the project declares in `dependencies`, `devDependencies`,
  `optionalDependencies` or `peerDependencies`. An incumbent that is imported but not declared
  is listed under `undeclared` and left alone. `--only` can name one, because naming it is the
  declaration. An undeclared incumbent gets no `graded` row, is never `removable`, and adds
  nothing to `next`. A directory with no `package.json` declares nothing, so it needs `--only`.
- **Tests.** `U12-3` in `migrate-u12.test.ts`, and `U12-3 — --only and --skip, through the
  binary` in `migrate-cli.test.ts`.

## U12-4 — a partial migration split class identity

- **Found on mac-cleaner.** One file's `@inquirer/core` import was refused because `usePagination`
  is an unknown export, while the other files were rewritten to caique. `ExitPromptError` from
  caique is then not `instanceof` the one `@inquirer/confirm` throws, so Ctrl+C printed an error
  where the program used to exit 0.
- **Fix.** An incumbent moves in every file or in none. The run now has phases. Pass 1 scans every
  file and writes none. Any incumbent that a refused file imports, or that a kept import names, is
  `held`, together with the files that hold it. The files that named an incumbent then get a
  second pass that skips the held ones, and only then is anything written. Skipping a package
  removes sites and never adds a refusal, so the second pass refuses nothing the first did not.
  The run also reads the installed manifest of each declared dependency that is not itself being
  migrated. When one of them depends on an incumbent being moved, the report lists the incumbent
  under `transitive`, with those dependencies and the target's error classes from `IDENTITY`. An
  import that names one of those classes stays on the incumbent as `kept`. So does an import whose
  names cannot be read (`import * as`, `require()`, `import()`, `export *`). Being kept, it holds
  the incumbent. A type-only import and a mock compare nothing at run time, so they move.
  `scripts/migrate-identity-lock.test.ts` imports every target and holds `IDENTITY` equal to the
  `Error` subclasses each one exports. Removing `HookError` from the table fails it.
- **Tests.** `U12-4` in `migrate-u12.test.ts`.

## U12-5 — the report printed JSON, and never said the run was partial

- **Found on both.** The human report printed `mapped`, `refused`, `detected`, `dependencies` and
  `graded` as raw one-line JSON. migrate exits 1 when anything is refused, but it has already
  rewritten the other files by then, and nothing said the result was partial.
- **Fix.** The report gains `summary`, which is one of `complete: N files rewritten`,
  `partial: N files rewritten, M refused` or `nothing to rewrite`, with `would be rewritten`
  under `--dry-run`. The text surface is `textOf(report)`, whose first line is the summary,
  followed by sections of aligned lines. It reaches the engine as a function under
  `Symbol.for('burgee.text')`, which `JSON.stringify` skips, so `--json`, `--json=<fields>`,
  `--format=agent` and MCP carry the data unchanged. The exit codes are unchanged, and
  [Migrate](https://burgee.interlace.tools/docs/migrate#exit-codes) and the exit-codes page now
  state them.
- **The engine side.** `render` left `execute.ts` for a lazily loaded `render.ts`. Nothing and a
  string still print on the start-up path, and anything else loads the chunk, which also honours
  the symbol. The core band had 12 bytes to spare at `ef3f89f7b8` (24,270 against a gate of
  24,282). The move takes 128 bytes off `import 'burgee'`: 24,270 -> 24,142 there, and
  24,208 -> 24,080 on main at `85dfea950d`. So the ceiling is not raised.
- **Tests.** `U12-5` in `migrate-u12.test.ts`, `render.test.ts`, and `says a run that refused
  something is partial, in the text and the code` in `migrate-cli.test.ts`.

## Proven red

Each new case was run against the code before this change: the original `migrate.ts`,
`program.ts`, `execute.ts` and `package.json`, with no `render.ts`, built to `dist`. On that code:

- In `migrate-u12.test.ts`, **48 of 56 failed**. The 8 that passed are guards against
  over-reach, all in the scope the fix widens:
  - six positions that are not module positions (`foo.mock('chalk')`, `vi.fn('chalk')`,
    `vi.mock.calls('chalk')`, a second argument, a comparison, `obj.vi.mock('chalk')`);
  - a mock whose specifier is not a literal, which must not refuse its file;
  - a type-only import of an error class, which must still move.
- Every new or restated case in `migrate-cli.test.ts`, `migrate.test.ts`,
  `migrate-lexer.test.ts` and `program.test.ts` failed (21 cases).
- `render.test.ts` failed to import, and `migrate-identity-lock.test.ts` failed all 32.

## What this restates

Some existing cases in `migrate.test.ts` encoded the behaviour U12-4 removes, and are restated
with a dated note beside each:

- `clean.ts` moving beside a refused `mixed.ts`;
- `cli.ts` moving beside a refused `legacy.ts`;
- a value import moving beside a kept type import;
- `ask.ts` moving to caique beside a clack file refused for `sibling-state`.

Fixtures that never had a `package.json` declare their incumbent now, because of U12-3. The
1,000-file bench tree declares commander and yargs. The bench was not loosened.
