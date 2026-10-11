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
| R1 | Not built | `compat-oracle/src/run.ts` | `run.test.ts` |
| R2 | Not built | `compat-oracle/vendor/extra-typings`, this file | the control run |
| R3 | Not built | `burgee/src/commander/extra-typings.*` | `npm run compat -- extra-typings`, `drop-in-type-surface-lock` |
| R4 | Not built | `burgee/src/compat.ts`, `migrate.ts` | `migrate-drop-ins-lock.test.ts`, `migrate.test.ts` |
| R5 | Not built | `subpath-weight` table | `subpath-weight-lock.test.ts` |
