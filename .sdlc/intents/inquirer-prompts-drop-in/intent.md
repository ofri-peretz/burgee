# Intent — `@inquirer/prompts`, graded: the largest prompt API on npm, with no dependency

> Stage 1 artifact. Opened from the next-wave ranking
> ([`next-wave-2026-10.md`](../../research/next-wave-2026-10.md)), from a gap `caique`'s own
> design names and leaves open.

**Status:** approved · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

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
