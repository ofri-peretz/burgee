# Design — `@inquirer/prompts`, graded

Intent: [`intent.md`](./intent.md). **Status:** approved.

**Accepted by the owner, 2026-10-12, by instruction: create and execute.** The instruction and the
evidence are recorded in [`next-wave-2026-10.md`](../../research/next-wave-2026-10.md).

> Requirement ids are `R1`… so they cannot collide with the floor ids `scripts/run-evals.ts`
> reads from `burgee/spec.md`.

---

## Requirements

- **R1 — `usePagination`, graded first.** Vendor `@inquirer/core`'s pagination suite at the
  version `GRADED_VERSIONS` already pins for `@inquirer/core` (12.0.4), into the existing
  `inquirer-core` host. Implement `usePagination` in `caique/inquirer` until the row is level
  with its control. This is the one piece caique's spec names as missing.
- **R2 — Vendor the ten prompt suites, and read what they import before designing anything.**
  `npm run compat -- --vendor inquirer-prompts` vendors the test file of each package
  `@inquirer/prompts` re-exports, at the version of `@inquirer/prompts` on the day.
  The PR records in this file:
  - each suite's imports: the prompt package, `@inquirer/testing`, `@inquirer/core` and any
    other;
  - the case count per prompt;
  - the control run's result against the real packages.

  No façade change lands in this PR. It is the measurement the rest is designed from.
- **R3 — The prompts, one PR per two or three.** `select` and `checkbox` first (they need R1),
  then `input`, `confirm`, `password` and `number`, then `expand`, `rawlist`, `search` and
  `editor`. Each is fixed in `caique/inquirer` until its cases are level with the control. A case
  the target cannot meet without the incumbent's own module state is excluded by exact title
  with the reason, the D-20260930 mechanism, and never by file.
- **R4 — Mapped and fingerprinted.** `DROP_INS` gains
  `{ host: 'inquirer-prompts', from: '@inquirer/prompts', to: 'caique/inquirer' }`. `burgee migrate`
  refuses a file importing a name `caique/inquirer` does not export, as it does for clack
  (D-20260930-migrate-refuses-clack-core). `npm run compat -- --fingerprint` re-points
  `packages/caique/competitors.json` from `inquirer` to `@inquirer/prompts`.
- **R5 — Weighed.** `caique/inquirer`'s bundled bytes go into `subpath-weight`'s table against
  `@inquirer/prompts` with its tree, and `scripts/subpath-weight-lock.test.ts` holds it at or
  under.

## Design

**One host, ten suites.** The oracle already grades multi-file suites (`ink` is 1,304 cases
across many files), so `inquirer-prompts` is one host in `packages/compat-oracle/src/hosts.ts`
whose `testGlob` covers the ten per-prompt test files. Its `imports` rewrite each
`@inquirer/<prompt>` specifier and `@inquirer/prompts` to `caique/inquirer`, with
`control: '<the real package>'`. If R2 finds the suites import `@inquirer/core` directly for
helpers, that specifier is rewritten too, to the same subpath the `inquirer-core` host already
targets.

**Named, not default.** `@inquirer/prompts` exports named prompts, and `caique/inquirer` already
does. The single-prompt packages export a default each, and are out of scope (see Out of
scope).

**The order is the dependency order.** Pagination unblocks `select` and `checkbox`, the two most
used prompts. The rest share the text-input path.

## Verification

| R | Check | Proven red by |
| :-- | :-- | :-- |
| R1 | `npm run compat -- inquirer-core` and `-- --control inquirer-core`, and `packages/burgee/src/compat-baseline-lock.test.ts` | the vendored pagination cases fail on today's `caique/inquirer`, which has no `usePagination` |
| R2 | the control run against the real packages, recorded in this file | the target run, on today's tree, fails every `select` and `checkbox` case that pages |
| R3 | `npm run compat -- inquirer-prompts`; `compat-baseline-lock.test.ts` refuses a row below its committed baseline | each prompt's cases before its PR |
| R4 | `scripts/migrate-drop-ins-lock.test.ts`, `packages/burgee/src/migrate.test.ts` (a fixture importing `select` and `checkbox`), and `packages/compat-oracle/src/competitors.test.ts` | a `DROP_INS` row with no `GRADED` row fails the lock |
| R5 | `scripts/subpath-weight-lock.test.ts` | a façade over the ceiling fails it |

## Rejected alternatives

- **Grade `inquirer` (the legacy `prompt([...])` API).** `caique/spec.md` rejected an
  `inquirer@8` façade: no new demand, and `inquirer` 9+ wraps `@inquirer/prompts` anyway.
- **Subtract every rendered-screen assertion, as D-001 did for clack.** caique already passes
  `@inquirer/core`'s screen assertions, so Inquirer's frames are reachable, and subtracting
  them would grade less than caique can do.
- **Write `usePagination` without its suite.** The spec already rejected this: an ungraded
  re-derivation is the unmeasured claim the oracle exists to prevent.

## Out of scope

- Drop-ins for the ten single-prompt packages (`@inquirer/select` and the rest). Each has a
  default export, so each needs its own subpath, and `@inquirer/prompts` carries the downloads.
- `@inquirer/testing` as a family export.
- clack's `box`, `progress` and `taskLog`: no graded case reaches them (`caique/spec.md` R8).

## Status

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | Not built | `caique/src/inquirer*.ts`, `compat-oracle/vendor/inquirer-core` | `npm run compat -- inquirer-core` |
| R2 | Not built | `compat-oracle/vendor/inquirer-prompts`, this file | the control run |
| R3 | Not built | `caique/src/inquirer*.ts` | `npm run compat -- inquirer-prompts` |
| R4 | Not built | `burgee/src/compat.ts`, `caique/competitors.json` | `migrate-drop-ins-lock.test.ts`, `competitors.test.ts` |
| R5 | Not built | `subpath-weight` table | `subpath-weight-lock.test.ts` |
