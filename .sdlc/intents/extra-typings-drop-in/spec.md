# Design — `@commander-js/extra-typings`, graded

Intent: [`intent.md`](./intent.md). **Status:** approved.

**Accepted by the owner, 2026-10-12, by instruction: create and execute.** The instruction and the
evidence are recorded in [`next-wave-2026-10.md`](../../research/next-wave-2026-10.md).

> Requirement ids are `R1`… so they cannot collide with the floor ids `scripts/run-evals.ts`
> reads from `burgee/spec.md`.

---

## Requirements

- **R1 — The oracle runs `tsd` suites.** `packages/compat-oracle/src/run.ts` gains
  `runner: 'tsd'`. It runs the vendored `tsd` against the host directory with the import
  specifier rewritten, parses its diagnostics, and reports each assertion as one case. A case
  passes when it raises no diagnostic. `expectError` passes when the expected error occurs.
  The runner's unit test feeds it a fixture suite with one true and one false assertion and
  requires one pass and one failure.
- **R2 — Vendor the suite and record it.** `npm run compat -- --vendor extra-typings` vendors
  `@commander-js/extra-typings` 15.0.0's test files. This file then records:
  - the assertion count;
  - the control run's result against the real package and commander 15.0.0;
  - every import the suite makes.

  The pin in `GRADED_VERSIONS` matches the commander version already graded.
- **R3 — `burgee/commander/extra-typings`.**
  - **Runtime**: a JavaScript entry re-exporting `burgee/commander`.
  - **Types**: a declaration file porting extra-typings' generic `Command`, `Option` and
    `Argument` types over `burgee/commander`'s classes, with extra-typings' MIT notice.
  - **Exports**: the `exports` entry gives both `import` and `require` conditions, as the other
    façades do (`scripts/drop-in-require-shape-lock.test.ts`).

  The work iterates until the row is level with the control.
- **R4 — Mapped.** `DROP_INS` gains
  `{ host: 'extra-typings', from: '@commander-js/extra-typings', to: 'burgee/commander/extra-typings' }`.
  `burgee migrate` rewrites it, and a TypeScript fixture modelled on `orval`'s import site
  compiles after migration.
- **R5 — Weighed.** The subpath's bundled bytes go into `subpath-weight`'s table against
  `@commander-js/extra-typings` plus `commander`, which is what a user installs today.

## Design

**Order:** R1 (the runner, proven on a fixture), R2 (vendor and measure), R3, R4, R5.

**Why a runner and not a script.** A type suite graded by a one-off script would be the one row
on the compatibility page that the oracle's control and baseline machinery does not check. A
`tsd` runner is about as large as the `ava` and `node:test` runners already in `run.ts`, and it
puts the row under `compat-baseline-lock` like every other.

**Why the runtime is free.** extra-typings' JavaScript is commander's. `burgee/commander` already
passes commander's 1,360 runtime cases, so this intent adds declarations and nothing that
executes.

## Verification

| R | Check | Proven red by |
| :-- | :-- | :-- |
| R1 | `packages/compat-oracle/src/run.test.ts`: the fixture suite yields one pass and one failure; a runner reporting files instead of assertions fails the count | the fixture's false assertion |
| R2 | the control run, recorded in this file | the target run before R3 fails to resolve the subpath |
| R3 | `npm run compat -- extra-typings` and `packages/burgee/src/compat-baseline-lock.test.ts`; `scripts/drop-in-type-surface-lock.test.ts` | each assertion fails until the ported types infer it |
| R4 | `scripts/migrate-drop-ins-lock.test.ts`; `packages/burgee/src/migrate.test.ts` with a TypeScript fixture compiled by `tsc --noEmit` | today: `migrate` leaves the import untouched |
| R5 | `scripts/subpath-weight-lock.test.ts` | a subpath over its ceiling fails it |

## R2 — the measurement

Vendored 2026-10-12 by `npm run compat -- extra-typings --vendor`: `@commander-js/extra-typings`
**15.0.0**, tag `v15.0.0` at `5a1af3d6`, thirteen `tests/*.test-d.ts` files and upstream's
`tsconfig.json` (`compat-oracle/vendor/extra-typings/PROVENANCE`). The suite's tsd, compiler,
`@types/node` and both incumbents are pinned in `suiteDeps` at the versions upstream's lockfile
resolves: `tsd@0.33.0`, `@tsd/typescript@5.9.3`, `@types/node@22.19.19`, `commander@15.0.0`,
`@commander-js/extra-typings@15.0.0`.

- **Assertions: 369**, every one tsd's own `extractAssertions` finds in the thirteen files
  (`expectType`, `expectAssignable`, `expectNotAssignable`); none is excluded.
- **Control: 369 / 369** against `@commander-js/extra-typings` 15.0.0 over commander 15.0.0
  (`npm run compat -- extra-typings --control`), with no diagnostic outside an assertion.
- **Target before R3: `target not built yet: burgee/commander/extra-typings`**, 0 / 0 — the
  subpath did not resolve.
- **Every import the suite makes:** `tsd` (`expectType`, `expectAssignable`,
  `expectNotAssignable`), and from `../index.js`, rewritten to the shim: `Command`, `Option`,
  `Argument`, `Help`, `CommandUnknownOpts`, `OptionValues`, `createOption`, `createArgument`,
  and `* as commander` in `commander.test-d.ts`.

`GRADED_VERSIONS` pins `@commander-js/extra-typings` at 15.0.0, the release whose peer range is
`commander ~15.0.0`, the commander graded at 1,360 / 1,360.

## R3–R5 — what was built

- **R3.** With only the runtime re-export (`export * from '../commander.js'`, burgee/commander's
  own declarations) the row read **205 / 390**: 164 of the 369 assertions failed, and 21
  diagnostics fell outside every assertion. With extra-typings' declarations ported over it,
  **369 / 369**, level with the control. The port is `burgee/src/commander/extra-typings.ts`:
  upstream's `index.d.ts` with `declare` where a `.ts` file needs it, and
  `InvalidOptionArgumentError` declared as a `const` and a type rather than re-exported, because
  a re-export of a declared class emits a JavaScript export of a binding that does not exist.
- **R4.** `DROP_INS`, `GRADED`, `GRADED_VERSIONS` and `SUPPORTED_MAJORS` carry the row, and
  `burgee migrate` rewrites the import. Before the row: `migrate.test.ts`'s table lacked the
  pair, and the orval-shaped program in `facade-types.test.ts` kept
  `from '@commander-js/extra-typings'`. After: it is rewritten and compiles under `strict`
  `NodeNext`, its options inferred (an `@ts-expect-error` assigning `options.output` to a
  `number` holds). The fixture is in `facade-types.test.ts`, beside `demo-cli-yargs`'s, because
  that file owns the compile-against-`dist` harness.
- **R5.** `burgee/commander/extra-typings` bundles to **61,207 B**, what `burgee/commander`
  bundles to; `@commander-js/extra-typings` plus `commander` bundle to **39,329 B**. U5 does not
  hold, so the row is not a `DROP_IN_CEILINGS` entry: it is an `OVER_INCUMBENT` ratchet in
  `subpath-weight-lock.test.ts` at 61,207 B, with the gap opened as
  [`B-20261012-extra-typings-bundles-heavier`](../../gaps/B-20261012-extra-typings-bundles-heavier.md),
  closed by [`D-20261012-extra-typings-inherits-front-end`](../../decisions/D-20261012-extra-typings-inherits-front-end.md):
  the door inherits `burgee/commander`'s position, and `commander-front-end-diet` takes the overage.
  Red with no row on the page, and red at a ratchet one byte under the measurement.

## Rejected alternatives

- **Generate the inferred types from burgee's own `InferOptions`.** That is burgee's native
  declaration style, not commander's chained `.option()` builder. The drop-in has to type the
  builder chain the way extra-typings does, or the suite fails and users' code stops compiling.
- **Count each test file as one case.** It would make a 200-assertion suite read as a handful of
  passes and hide every partial file. The oracle counts what the suite asserts.
- **Leave it to `@types` and tell users to keep extra-typings.** It keeps `commander` in their
  tree, so the migration removes nothing, and `migrate` cannot rewrite the import.

## Out of scope

- `@commander-js/extra-typings` majors other than 15. They track commander majors the oracle does
  not grade.
- Typed yargs beyond what `burgee/yargs` already exports from `@types/yargs`' surface.

## Status

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | **Built** 2026-10-11 | `compat-oracle/src/run.ts`, `compat-oracle/src/tsd.ts` | `run.test.ts` (the tsd runner): the fixture's true and false assertions grade 1 pass, 1 failure out of 2 cases in 1 file. Red on the unbuilt state (`Cannot find module './tsd.js'`), and red again against a runner that counts files (`tests: 1, passed: 0` received for `tests: 2, passed: 1`). tsd is pinned per suite in `suiteDeps`, not a workspace devDependency (D-20261011-tsd-is-a-suite-dependency) |
| R2 | **Built** 2026-10-12 | `compat-oracle/vendor/extra-typings`, `compat-oracle/src/hosts.ts`, this file | the control run: 369 / 369 over 369 assertions; the target run before R3 reported `target not built yet: burgee/commander/extra-typings` |
| R3 | **Built** 2026-10-12 | `burgee/src/commander/extra-typings.ts`, `burgee/package.json` | `npm run compat -- extra-typings`: 369 / 369, level with the control (205 / 390 with burgee/commander's own types); `compat-baseline-lock`, `drop-in-type-surface-lock`, `drop-in-require-shape-lock` |
| R4 | **Built** 2026-10-12 | `burgee/src/compat.ts`, `migrate.ts` | `migrate-drop-ins-lock.test.ts`, `migrate.test.ts`, and the orval fixture in `facade-types.test.ts` compiled against the built `dist` |
| R5 | **Built** 2026-10-12, over its incumbent | `subpath-weight-lock.test.ts` (`OVER_INCUMBENT`), `/docs/weight` | `subpath-weight-lock.test.ts`: 61,207 B against 39,329 B, a ratchet; B-20261012-extra-typings-bundles-heavier closed by D-20261012-extra-typings-inherits-front-end |

**Built: 5. Not built: 0.**
