# Intent — `burgee migrate` says what the move costs the project before it writes anything

**Status:** approved (2026-10-19, under the owner's delegation, [`D-20261019-migrate-preflight-design-accepted`](../../decisions/D-20261019-migrate-preflight-design-accepted.md)) · **Opened:** `2026-10-18` · **Owner:** `@ofri-peretz` · **Design:** [`spec.md`](./spec.md)

---

## What is wanted

Before it rewrites a file, `burgee migrate` reads the project's module format, its
`engines.node`, its test runner and its TypeScript `moduleResolution`. The report then names
every one of them that the move breaks or changes:

- **The floor.** The project allows a Node below the family's `^20.19.0 || >=22.13.0`. Adopting
  raises the project's floor, which is a semver-major for it.
- **CommonJS on a Node without `require(esm)`.** The project is CommonJS and allows a Node on
  which `require()` of an ES module throws.
- **jest from CommonJS.** jest's module loader cannot load an ES-module-only drop-in.
- **`node10` resolution.** TypeScript cannot see the subpath types. This row goes away once
  [`types-under-node10`](../types-under-node10/intent.md) lands.
- **A dirty tree.** When the only dirt is untracked files the install wrote, the refusal names
  them.

Each row carries the same `fix` line every burgee error carries. Where the move would leave a
tree that cannot load, migrate exits non-zero **before** writing.

## Why now

From [`adoption-barriers-2026-10.md`](../../research/adoption-barriers-2026-10.md), barriers 2, 3
and 8:

- 32.4% (30.4–34.4%, n = 2,215) of commander and yargs dependents are CommonJS-only and allow
  Node below 20.19. On Node 18.20 and 21.7, `require('burgee/commander')` is `ERR_REQUIRE_ESM`.
  On Node 18, `roundel/chalk` and `flagstaff/ora` fail at import (`styleText`).
- 65.2% of those that declare `engines.node` allow a Node below the floor. That is 5 of the 9
  trial CLIs, and no report said so. `npm install` only prints an `EBADENGINE` warning.
- 8.3% run jest on a CommonJS package. In the trial, @swc/cli lost a test suite to
  `Cannot use import statement outside a module`.
- @swc/cli's `pnpm install` wrote an untracked `node-compile-cache/`, and migrate refused the
  dirty tree without saying which file made it dirty.

## Affected users and systems

- Every project that runs `burgee migrate`.
- `packages/burgee/src/migrate.ts`: the report gains a `preflight` field. The exit-code table is
  unchanged.
- The migrate docs page.

## Constraints

- **Zero runtime dependencies.** Range minimums are computed in-house; there is no `semver`.
- **No new exit code.** A blocking preflight row is a refusal (exit 1), like any other.
- **`--force` keeps its meaning.** It skips the git-tree check only, never a preflight that says
  the result cannot load.

## Success criteria

- Fixtures of wait-port (`>=10`, CommonJS), svgo (`>=16`, ESM), tsc-alias (TS `node`), and
  @swc/cli (jest + CommonJS, untracked cache) each produce the matching `preflight` row. The test
  fails on the code before the change.
- A project on `"type": "module"` with `engines.node >= 22` gets no rows.
- `--json` carries the rows as data; the human report prints them before the rewrite list.

## Scope, decided here

- **jest from CommonJS.** migrate prints a blocking row whose `fix` names the jest options that
  load ES modules (`transformIgnorePatterns`, `--experimental-vm-modules`). It does not edit the
  project's jest config. Rejected: rewriting jest config, which is outside the module-specifier
  surface migrate is limited to (D-050 … D-054).
- **A CommonJS build of the family.** Not weighed here. The floor in
  [`cli-packaging`](../cli-packaging/intent.md) stands, and this intent only makes it visible
  before the move.

## Open questions

None.
