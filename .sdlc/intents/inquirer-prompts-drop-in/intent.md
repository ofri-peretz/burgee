# Intent — `@inquirer/prompts`, graded: the largest prompt API on npm, with no dependency

> Stage 1 artifact. Opened from the next-wave ranking
> ([`next-wave-2026-10.md`](../../research/next-wave-2026-10.md)), from a gap `caique`'s own
> design names and leaves open.

**Status:** shipped · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz · **Shipped:** 2026-10-25 on
[`70a86aa695`](https://github.com/ofri-peretz/burgee/commit/70a86aa695) (#1201), released in caique 1.5.0 (npm, 2026-10-25T18:00Z, Version PR #1237) and, for the `migrate` row, burgee 1.7.0 (npm, 2026-10-25T17:05Z, Version PR #1231), verified against `main` at
[`aff0c31f`](https://github.com/ofri-peretz/burgee/commit/aff0c31fdf) — criterion 1 read 213 / 213 against a control of 213 / 213 on CI (Compatibility run 40180212984), criteria 2–4 unchanged since #1201 (below) · **Design:** [`spec.md`](./spec.md)

---

## What is wanted

`caique/inquirer` is a graded drop-in for `@inquirer/prompts`, the prompts people call: `input`,
`select`, `checkbox`, `confirm`, `password`, `number`, `expand`, `rawlist`, `search` and
`editor`. Each is graded by its own package's test suite in the Inquirer repository, with a
control run against the real packages. `burgee migrate` rewrites `@inquirer/prompts` to it.

Today caique is graded only one layer down, against `@inquirer/core`'s hooks (41 / 41). A user
who imports `select` from `@inquirer/prompts`, which is how Inquirer's own README teaches it, has
no graded path.

## Why now

- **Demand.** `@inquirer/prompts` is **43,208,181** downloads a week, and `inquirer` 47,025,339
  (`api.npmjs.org`, 2026-10-03..09). Prompts are caique's layer, and caique's incumbents carry 68
  open upstream issues, the largest pool outside the engine (`layer-roadmap.md`).
- **The gap is named in caique's own design** (`.sdlc/intents/caique/spec.md`, the section headed "R8 — `caique/inquirer`"):
  *"`usePagination` is not implemented … It is the one thing standing between this subpath and a
  full drop-in for `@inquirer/prompts`' `select` and `checkbox`, and the way to close it is to
  grade it — `@inquirer/core`'s repository has a pagination suite that is not vendored yet."*
- **A fingerprint left pointing at the wrong package.** The same spec, closing its `caique/clack` section: *"`competitors.json`
  still fingerprints `inquirer` at the `./ask` subpath. Re-pointing it at `@inquirer/prompts`
  needs a `npm run compat -- --fingerprint` run … it is its own change."*
- `caique/inquirer`'s header already states its target as "@inquirer/prompts' API, same (never
  inquirer@8's)". The code is aimed there, and the grade is not.

## Affected users and systems

- **Users** of `@inquirer/prompts` and of `inquirer` 9+, which wraps it.
- `packages/caique` (`src/inquirer*.ts`, `competitors.json`), `packages/compat-oracle` (a vendored
  pagination suite and ten per-prompt suites), and `GRADED`, `DROP_INS` and `GRADED_VERSIONS` in
  `packages/burgee/src/compat.ts`.
- The compatibility page and caique's README benchmark block, both generated.

## Constraints

- **Suites run unedited.** A case is subtracted only by exact title with a reason on the
  compatibility page. Rendered-screen assertions count as contract, as they already do for the
  41 `@inquirer/core` cases caique passes. The clack exception (D-001: snapshot files subtracted
  as a declared subset) is not extended here unless a case cannot be met without the
  incumbent's own module state, as D-20260930-caique-clack-core-exclusion found once.
- **Zero runtime dependencies** in caique. Test helpers the suites import (`@inquirer/testing`)
  are workspace devDependencies, as `vendored-suite.test.ts` requires.
- **caique's floor holds.** In a non-TTY a prompt is a usage error naming its flag when it runs
  under burgee. The drop-in reproduces Inquirer's own behaviour when called directly, because
  that is what Inquirer's suite grades.
- **No heavier than the incumbent** (`U5`): `caique/inquirer`'s bundled bytes are at or under
  `@inquirer/prompts` and its tree.

## Success criteria

1. `GRADED` carries an `inquirer-prompts` row, level with its control or with every subtracted
   case named by exact title. `npm run compat -- inquirer-prompts` reproduces it.
2. `@inquirer/core`'s pagination suite is vendored, and the `inquirer-core` row grows by its cases
   and stays level with its control.
3. `burgee migrate` rewrites `@inquirer/prompts` to `caique/inquirer` in a fixture, and
   `scripts/migrate-drop-ins-lock.test.ts` passes.
4. `packages/caique/competitors.json` fingerprints `@inquirer/prompts`.

## Open questions

- Whether the single-prompt packages (`@inquirer/select` and the rest) get drop-ins too.
  **Answered 2026-10-12 in `spec.md`**: not in this intent. Their default exports would each need
  a subpath of their own, and `@inquirer/prompts` is where the downloads are.

## Status — 2026-10-20

Built on `feat/inquirer-prompts-drop-in` against `main` at `71dbe45e`; the spec's *Re-grounded*
section records what changed from the design as written.

| Criterion | Evidence |
| :-- | :-- |
| 1. `GRADED` carries an `inquirer-prompts` row, level with its control or with every subtracted case named by exact title; `npm run compat -- inquirer-prompts` reproduces it | **Met.** 213 / 213 against a control of 213 / 213 at `@inquirer/prompts` 8.7.3 (`baseline/inquirer-prompts.json`); 100 / 213 on `main` before this change. The eleven `editor` cases are subtracted by exact title for both sides and listed on the compatibility page (D-20261011-inquirer-prompts-editor-mock). |
| 2. The pagination suite is vendored, and its row grows by its cases and stays level with its control | **Met, restated.** The suite is `select`'s (`packages/select/test/pagination.test.ts`, 10 cases), since `@inquirer/core` 12.0.4 ships none (D-20261011-inquirer-pagination-suite-is-selects), so it counts in the `inquirer-prompts` row; `inquirer-core` stays 41 / 41. |
| 3. `burgee migrate` rewrites `@inquirer/prompts` in a fixture, and `scripts/migrate-drop-ins-lock.test.ts` passes | **Met.** `migrate.test.ts` › "moves an @inquirer/prompts program to caique/inquirer/prompts, and refuses a name the subpath does not export", red with `main`'s row; the Migrate page and `MAPPING` carry the row. |
| 4. `packages/caique/competitors.json` fingerprints `@inquirer/prompts` | **Met.** `./inquirer/prompts` claims `compat` against the `inquirer-prompts` host, fingerprinted at 8.7.3 (25 packages, 547,175 B). |

## Shipped — 2026-10-25

`caique@1.5.0` is on npm (`npm view caique time`, `"1.5.0":` `2026-10-25T18:00:55.029Z`; release run
40216716346 on `64912a97ab`, after Version PR #1237). Its `exports` carry `./inquirer/prompts`
(`types` `dist/inquirer-prompts.d.ts`, `import` and `default` `dist/inquirer-prompts.js`).
Installed from npm beside `@inquirer/prompts@8.7.3`, `import('caique/inquirer/prompts')` exports
`Separator`, `checkbox`, `confirm`, `editor`, `expand`, `input`, `number`, `password`, `rawlist`,
`search` and `select`, and no name `@inquirer/prompts` exports is missing. `burgee@1.7.0`
carries #1201's `migrate` row, and `burgee@1.7.1`'s family map names `caique` `1.5.0`, so the install line
`migrate` prints reaches a caique that has the subpath. npm matches `main` for all ten packages
(checked 18:26 UTC).

| Criterion | Evidence on release |
| :-- | :-- |
| 1. `GRADED` carries an `inquirer-prompts` row, level with its control or with every subtracted case named by exact title; `npm run compat -- inquirer-prompts` reproduces it | CI Compatibility run 40180212984 on `main` at `1f6be56d6e`: `inquirer-prompts 213 / 213 100.0% ▲ 0`. The bench record at the release commit, `benchmarks/results/cli-benchmarks/2026-10-25-3ef9e76-ci.json`, reads `passed 213`, `reference 213`, `denominator 213`. The eleven `editor` cases stay subtracted by exact title for both sides (D-20261011-inquirer-prompts-editor-mock). |
| 2. The pagination suite is vendored, and its row grows by its cases and stays level with its control | **Met as restated** (D-20261011-inquirer-pagination-suite-is-selects): the suite is `select`'s and counts in the `inquirer-prompts` row above; `inquirer-core` reads **41 / 41** in the same run. |
| 3. `burgee migrate` rewrites `@inquirer/prompts` in a fixture, and `scripts/migrate-drop-ins-lock.test.ts` passes | The target is `caique/inquirer/prompts`, not `caique/inquirer` as written (D-20261012-caique-inquirer-prompts-subpath). `migrate.test.ts` › "moves an @inquirer/prompts program to caique/inquirer/prompts …" and `migrate-drop-ins-lock.test.ts` pass on `main`; the row shipped in burgee 1.7.0. The type-surface and `require()` locks (`drop-in-type-surface-lock.test.ts`, `drop-in-require-shape-lock.test.ts`) pass, and a strict `tsc` consumer of the published subpath compiles. |
| 4. `packages/caique/competitors.json` fingerprints `@inquirer/prompts` | Unchanged since #1201: `./inquirer/prompts` claims `compat` against the `inquirer-prompts` host at 8.7.3. The published subpath bundles to 44,683 B against `@inquirer/prompts`' 582,754 B (`apps/docs/content/docs/weight.mdx`, held by `subpath-weight-lock.test.ts`). |
