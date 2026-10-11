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

## R2 — the measurement (2026-10-11)

`npm run compat -- --vendor inquirer-prompts` at **`@inquirer/prompts` 8.7.3**, the release on
the day: tag `@inquirer/prompts@8.7.3`, commit `a9436bd9`, which is also `@inquirer/core@12.0.4`'s.
Eleven files, because `select` keeps its pagination suite beside its own
(D-20261011-inquirer-pagination-suite-is-selects).

| Prompt | File | Cases | Imports besides vitest |
| :-- | :-- | --: | :-- |
| `input` | `input/input.test.ts` | 20 | `@inquirer/testing`, `./src/index.ts` (default) |
| `select` | `select/test/select.test.ts` | 42 | `@inquirer/testing`, `../src/index.ts` (default, `Separator`) |
| `select` | `select/test/pagination.test.ts` | 10 | `@inquirer/testing`, `../src/index.ts` (default, `Separator`) |
| `checkbox` | `checkbox/checkbox.test.ts` | 48 | `@inquirer/testing`, **`@inquirer/core`** (`ValidationError`), `./src/index.ts` (default, `Separator`) |
| `confirm` | `confirm/confirm.test.ts` | 15 | `node:util` (`styleText`), `@inquirer/testing`, `./src/index.ts` (default) |
| `password` | `password/password.test.ts` | 11 | `@inquirer/testing`, `./src/index.ts` (default) |
| `number` | `number/number.test.ts` | 18 | `@inquirer/testing`, `./src/index.ts` (default) |
| `expand` | `expand/expand.test.ts` | 13 | `@inquirer/testing`, `./src/index.ts` (default, `Separator`) |
| `rawlist` | `rawlist/rawlist.test.ts` | 16 | `@inquirer/testing`, `./src/index.ts` (default, `Separator`) |
| `search` | `search/search.test.ts` | 20 | `@inquirer/testing`, **`@inquirer/type`** (`withResolver`, a promise helper), `./src/index.ts` (default, `Separator`) |
| `editor` | `editor/editor.test.ts` | 11 | `@inquirer/testing`, **`@inquirer/external-editor`** (`editAsync`, mocked with `vi.mock`), `./src/index.ts` (default) |
| | | **224** | |

**What the imports decided.**

- **Every suite imports its prompt as a default** of its own package. The drop-in is
  `@inquirer/prompts`', which exports each prompt by name. So the oracle gained
  `HostImport.defaultExport`: the shim is `export * from '<module>'` plus
  `export { select as default } from '<module>'`, where `<module>` is `@inquirer/prompts` on the
  control and `caique/inquirer` on a target run. What is graded is the named import a program
  migrates.
- **One host, eleven files in ten packages**, so the oracle also gained `Host.suiteFiles`: the
  files written out and the only ones vendored. A `testDir` of `packages` copied whole would
  have vendored every prompt's implementation and every other package's tests.
- **`@inquirer/core` is rewritten too**, to `caique/inquirer`: checkbox asserts the prompt
  rejects with `toBeInstanceOf(ValidationError)`, so the class has to be the one the prompt
  throws. `@inquirer/type`'s `withResolver` stays the real package; it builds a promise in the
  test and touches no prompt.
- **`editor.test.ts` cannot grade any implementation of ours.** Every one of its eleven cases
  asserts on, and answers through, the mocked `editAsync` of `@inquirer/external-editor`, which
  caique does not import. Excluded by exact title for both sides
  (D-20261011-inquirer-prompts-editor-mock), so the row is **213** cases.

**The control**, against the real packages (`suiteDeps`: `@inquirer/prompts@8.7.3`,
`@inquirer/core@12.0.4`, `@inquirer/testing@3.3.14`, `@inquirer/type@4.2.0`,
`@inquirer/external-editor@3.0.6`):

- first run: **213 / 224**, the eleven editor cases failing — the mock never reached the
  published `@inquirer/editor`, which vitest externalizes, so each case opened a real `vi` and the
  run hung to the oracle's cap;
- with `@inquirer/prompts` and `@inquirer/editor` inlined (`vitestConfig`), upstream's own
  conditions: **224 / 224**;
- with the editor exclusion: **213 / 213, 100.0%**.

**The target on today's tree**: **`caique/inquirer` 0 / 213.** Every case fails the same way,
`TypeError: prompt is not a function` (222 of 224 raw TAP failures; the other two,
`default is not a function`, are the same absence reached through a different line), because
`caique/inquirer` exports `@inquirer/core`'s surface and none of the ten prompts. That is the
R2 red the Verification table names, for every `select` and `checkbox` case that pages and for
every other case besides.

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

## R1, R3–R5 — what was built, and what the tarball held back (2026-10-11)

**R1 and R3's first slice landed: `select`, `checkbox` and `usePagination`, 100 / 213.** The
other eight prompts were written and graded too, and do not fit caique's tarball ratchet, so
they are held out of the package. The ratchet is a budget (`check:artifacts`: 10% over
`artifact-size-baseline.json`'s 70,917 B gzipped and 240,290 B unpacked), and raising it is a
decision this design does not take for itself
([B-20261011-inquirer-prompts-tarball-room](../../gaps/B-20261011-inquirer-prompts-tarball-room.md)).

| caique, `npm pack --dry-run` | gzipped | unpacked |
| :-- | --: | --: |
| main | 72,434 | 245,044 |
| all ten prompts, as first built | 88,160 | 312,487 |
| all ten, without the shipped fixture and the unreachable `.d.ts` files | 82,960 | 296,753 |
| `select` and `checkbox` (this change) | 75,740 | 260,476 |
| ceiling | 78,008 | 264,319 |

- **Room found, not taken.** tsc compiled `src/__fixtures__/inquirer-render.ts`, a stand-in for
  `@inquirer/testing` that only tests import, into the tarball; `tsconfig.build.json` now
  excludes it and `check:artifacts` refuses any `__fixtures__/` path
  (`artifact-size-ratchet-lock.test.ts`). Six declaration files no `exports` entry reaches
  (`check.d.ts`, `cli.d.ts`, `clack-list.d.ts`, `clack-path.d.ts`, `line-edit.d.ts`,
  `inquirer-screen.d.ts`, 12,740 B) are deleted after the build by
  `scripts/prune-declarations.mjs`, which walks `exports`' `types` the way a checker does.
  Together 5,200 B gzipped and 15,734 B unpacked, which is what lets two prompts in.
- **The engine split.** `createPrompt`, `useKeypress`, `usePrefix` and `Separator` moved from
  `inquirer.ts` to `inquirer-core.ts`, unchanged, because the prompts are built on them and
  `inquirer.ts` re-exports the prompts: one module holding both would import itself.
  `inquirer.ts` is now the subpath's barrel. `inquirer-core` stays 41 / 41.
- **What the suites decided that reading the API would not have.** A prompt edits readline's
  own line (`rl.line`, `rl.clearLine`); `select` clears a typed jump 700 ms after the last key;
  `checkbox` awaits `validate` before it checks `required`. Each is a graded case.
- **caique stays at 100% coverage** with the new modules in the denominator, driven through
  `src/__fixtures__/inquirer-render.ts`.
- **R4 is half built.** `competitors.json` fingerprints `@inquirer/prompts` 8.7.3 as
  `inquirer-prompts` (`compat`). The `DROP_INS` row has stood since R2, and `migrate` rewrites a
  row only when it is level (D-137), so `@inquirer/prompts` is not rewritten until the eight
  land. `FACADE_EXPORTS` lists what `caique/inquirer` exports now.
- **R5 is held.** Weighing two prompts against the whole of `@inquirer/prompts` would be a
  comparison that flatters; the row goes in with the last prompt.

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
| R1 | **Built** 2026-10-11 — re-scoped: the pagination suite is `select`'s (D-20261011-inquirer-pagination-suite-is-selects); `usePagination` passes its 10 cases and every paging `select` and `checkbox` case | `caique/src/inquirer-pagination.ts`, `compat-oracle/vendor/inquirer-prompts/packages/select/test/pagination.test.ts` | `npm run compat -- inquirer-prompts` |
| R2 | **Built** 2026-10-11 — vendored at 8.7.3, control 213 / 213, target 0 / 213 | `compat-oracle/vendor/inquirer-prompts`, this file (§ R2 — the measurement) | `npm run compat -- inquirer-prompts --control` |
| R3 | **Partly built** 2026-10-11 — `select` and `checkbox`, 100 / 213 against a control of 213 / 213; the other eight held by the tarball ratchet (B-20261011-inquirer-prompts-tarball-room) | `caique/src/inquirer-{core,choices,pagination,select,checkbox}.ts` | `npm run compat -- inquirer-prompts`; `compat-baseline-lock.test.ts` |
| R4 | **Partly built** 2026-10-11 — `competitors.json` fingerprints `@inquirer/prompts` 8.7.3; `migrate` rewrites it once the row is level | `caique/competitors.json`, `burgee/src/migrate.ts` (`FACADE_EXPORTS`) | `competitors-lock.test.ts`, `migrate-drop-ins-lock.test.ts` |
| R5 | Not built — held until the row is level (B-20261011-inquirer-prompts-tarball-room) | `subpath-weight` table | `subpath-weight-lock.test.ts` |
