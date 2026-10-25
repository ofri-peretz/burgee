# Design — `@inquirer/prompts`, graded

Intent: [`intent.md`](./intent.md). **Status:** shipped 2026-10-25 in caique 1.5.0 (Version PR #1237), with the `migrate` row in burgee 1.7.0 (Version PR #1231).

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
  `{ host: 'inquirer-prompts', from: '@inquirer/prompts', to: 'caique/inquirer/prompts' }`
  (the subpath, not `caique/inquirer`: D-20261012-caique-inquirer-prompts-subpath). `burgee migrate`
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
| R1 | `npm run compat -- inquirer-prompts` (`select/test/pagination.test.ts`, 10 cases) and `-- --control inquirer-prompts`; `packages/caique/src/inquirer-prompts.test.ts` (every branch of the window) | the vendored pagination cases fail on a `caique/inquirer` with no `usePagination` (#1037) |
| R2 | the control run against the real packages, recorded in this file | the target run, on the tree of 2026-10-11, fails every case (0 / 213) |
| R3 | `npm run compat -- inquirer-prompts` reads **213 / 213**; `compat-baseline-lock.test.ts` refuses a row below `baseline/inquirer-prompts.json`; `caique`'s `inquirer-{input,keyed,search,editor}.test.ts` (64 cases) at 100% coverage | main at `71dbe45e` reads 100 / 213. Against main's sources the `keyed` and `search` suites fail 25 cases (`prompt is not a function`), and the `input` and `editor` suites do not load |
| R3 | [`search.qnt`](./search.qnt) `safety` under `step`, each rejected design (§ Quint model) violating it, and `answersFromTermOnScreen` still violated, in `models.yml` | written with the build: `stepNoAbort` and `stepEnterLoading` each fail `safety`; `someAnswer` is violated |
| R4 | `packages/burgee/src/migrate.test.ts` › `moves an @inquirer/prompts program to caique/inquirer/prompts, and refuses a name the subpath does not export`, and › `maps every row, subpaths included`; `scripts/migrate-drop-ins-lock.test.ts`; `packages/burgee/src/facade-types.test.ts` (`FACADE_EXPORTS` equal to the built declarations); `scripts/competitors-lock.test.ts` | with main's `GRADED` row (100 / 213, not level) the fixture is not rewritten and the case fails |
| R4 | `scripts/drop-in-type-surface-lock.test.ts` and `scripts/drop-in-require-shape-lock.test.ts` (`@inquirer/prompts` 8.7.3 against `caique/inquirer/prompts`) | main's subpath exports two of the ten prompts, so eight value names are missing |
| R5 | `scripts/subpath-weight-lock.test.ts` (`DROP_IN_CEILINGS`: 582,754 B); `packages/caique/src/weight.test.ts` (`./inquirer/prompts` at 65,000 B) | a façade over the ceiling fails it; the budget refused 63,105 B at 38,000 before D-20261020-caique-inquirer-prompts-budget |
| all | `npx tsx scripts/mutation.ts changed --event pull_request --base origin/main` — every mutant on the changed lines detected: caique 989 killed and 1 timed out of 990, burgee 38 of 38 | the first run on the ported tests left 165 survivors and 197 timeouts in caique, over the lane's 11-minute budget; tests were added and code a mutant showed to be dead or equivalent was removed (§ Re-grounded) |

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

## Re-grounded 2026-10-20, on main at `71dbe45e`

What the design above says and what was built differ in these places; each is recorded here
rather than rewritten above, so the 2026-10-12 acceptance stays readable.

- **The target is `caique/inquirer/prompts`, not `caique/inquirer`** (D-20261012-caique-inquirer-prompts-subpath,
  #1037). R3's "fixed in `caique/inquirer`", the Design's "rewrite … to `caique/inquirer`" and R4's
  "a name `caique/inquirer` does not export" all read `caique/inquirer/prompts`. `@inquirer/core`'s
  `ValidationError` import still grades `caique/inquirer`, so the class is the one the prompt throws.
- **R1's suite is `select`'s** (D-20261011-inquirer-pagination-suite-is-selects): `@inquirer/core`
  12.0.4 ships no pagination suite, and upstream moved it to `select/test/pagination.test.ts`. So
  the 10 cases count in the `inquirer-prompts` row, not the `inquirer-core` one, which stays
  41 / 41; intent criterion 2 is met by that file. `usePagination` is internal to the prompts and
  not exported from `caique/inquirer`, as D-20261012 deferred.
- **R3 landed in two PRs, not four**: `select` and `checkbox` in #1037, the other eight here.
  The control reads 213 / 213 since #1178 pinned the ten prompt releases
  (D-20261019-inquirer-prompts-pins-its-prompts) and #1180 time-pinned the suite's install.
- **No new exclusion.** The eleven `editor` cases stay excluded for both sides
  (D-20261011-inquirer-prompts-editor-mock); every other case passes. `editor` is held by
  `inquirer-editor.test.ts` against the same frames, with a real child process as the editor.
- **`editor` starts the editor through `bellpull/cross-spawn`**, so caique gains `bellpull` as a
  dependency (5 in the family, 0 outside). `scripts/inline-implementation-lock.test.ts` refused
  `node:child_process` in caique: spawning is bellpull's job. `shape.test.ts`, the layers page and
  the READMEs follow.
- **R4's fingerprint is taken at the graded release**, `@inquirer/prompts` 8.7.3, under
  `./inquirer/prompts`, rather than by `--fingerprint`, which reads `latest` (8.7.4 since
  2026-10-19, the release #1178 pinned away from). The watch reports 8.7.4 as the next re-vendor.
- **R4 gains the type and `require()` locks**: `@inquirer/prompts` 8.7.3 is a root
  devDependency (it was already hoisted for `@stryker-mutator/core`) and Dependabot-ignored, as
  supports-color is, so `drop-in-type-surface-lock` and `drop-in-require-shape-lock` compare the
  pair. Every name `@inquirer/prompts` exports is exported, types included.
- **R5's ceiling is measured, not copied**: 582,754 B bundled for `@inquirer/prompts` 8.7.3 with
  its ten pinned prompts and `@inquirer/core` 12.0.4, by `/docs/weight`'s method; ours is 44,683 B.
- **What the mutation lane changed.** Code it showed dead or equivalent was removed rather than
  excused: `trimEnd()` on rows the screen manager already right-trims, `useMemo` over a prompt's
  own config (it never changes in a prompt's life), a second `setSearchError` after the effect's
  own, `password`'s `setValue(value)` to itself, `expand`'s never-drawn help row, the `done`
  guards on hints `!value` already rules out, and `decimal()`'s unused defaults. Four
  `// Stryker disable` lines remain, each a constant dependency list or the `stdio: 'inherit'`
  a test process has no terminal to observe. The test fixture now bounds each wait on a frame
  or an answer to 3 s of real time, so a mutant that never draws fails at once instead of
  timing out, and it can send a key with the text a terminal sends (Tab's `\t`).
- **Budgets moved** (D-20261020-caique-inquirer-prompts-budget): `./inquirer/prompts` 38,000 →
  65,000 B on disk (measured 63,105), and caique's tarball figure to 79,416 / 288,332 B.

## Quint model: needed? Yes, for `search`

Nine of the ten prompts settle in the turn that answers them, or await only their own
`validate` with keys ignored meanwhile (`status !== 'idle'`), which caique's
[`prompt-session.qnt`](../../models/prompt-session.qnt) already models for clack's session.
`search` is different: every edit to the term calls `source` again, and those calls settle in
any order. [`search.qnt`](./search.qnt) states it, one action per JS turn, with the store and
the last frame drawn apart, because a key's handler reads the frame's state. `safety` holds
that a list from an aborted call is never drawn and that an answer is at most one edit behind
the term. The rejected designs, each checked in `models.yml` to still fail: drawing an aborted
call (`stepNoAbort`, the race `search.test.ts` › "Handles race conditions between source calls"
grades) and answering while a call the prompt has drawn as loading is out
(`stepEnterLoading`). `someAnswer` is expected to be violated, so `safety` is not vacuous.
`models.yml` runs on changes to `inquirer-search.ts`.

**What the model found.** Its first version had `edit` mark the prompt loading in its own turn,
and the ported tests showed the code does not: the effect that marks a new search loading
draws nothing until the next frame, so the key right after an edit still sees the previous
list as idle. Marking it loading in the key's own turn was tried and graded **212 / 213**:
`search.test.ts` › "Autocomplete with tab" presses Enter straight after Tab and expects the
choice drawn under the cursor. So the drop-in keeps the incumbent's timing, the model describes
it, and the property it gives up is pinned as an open question below.

## Open questions

- **Should Enter straight after a key answer from the list of the term before it?** It does
  in `@inquirer/search` 8.7.3 and here (`search.qnt` › `answersFromTermOnScreen`, expected to be
  violated in `models.yml`; `inquirer-search.test.ts` holds that the second key after an edit
  is held). Changing it costs the "Autocomplete with tab" case, so it waits for upstream.

## Status

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | **Built** 2026-10-12 (#1037) — `usePagination`, graded with `select` (D-20261011-inquirer-pagination-suite-is-selects): `pagination.test.ts` 10 / 10, level with the control; internal to the prompts (D-20261012-caique-inquirer-prompts-subpath) | `caique/src/inquirer-pagination.ts`, `compat-oracle/vendor/inquirer-prompts/packages/select/test/pagination.test.ts` | `npm run compat -- inquirer-prompts` |
| R2 | **Built** 2026-10-11 — vendored at 8.7.3, control 213 / 213, target 0 / 213 | `compat-oracle/vendor/inquirer-prompts`, this file (§ R2 — the measurement) | `npm run compat -- inquirer-prompts --control` |
| R3 | **Built** 2026-10-20 — all ten prompts at `caique/inquirer/prompts`, **213 / 213**, level with the control of 213 / 213; the eleven `editor` cases excluded for both sides (D-20261011-inquirer-prompts-editor-mock) | `caique/src/inquirer-{select,checkbox,input,keyed,search,editor,choices,choice,prompts}.ts`; [`search.qnt`](./search.qnt) | `npm run compat -- inquirer-prompts`; `compat-baseline-lock.test.ts`; `models.yml` |
| R4 | **Built** 2026-10-20 — `migrate` rewrites `@inquirer/prompts` and refuses a name the subpath lacks; `FACADE_EXPORTS`, the type and `require()` locks; `competitors.json` fingerprints 8.7.3 under `./inquirer/prompts` | `burgee/src/compat.ts`, `burgee/src/migrate.ts`, `caique/competitors.json` | `migrate.test.ts`, `migrate-drop-ins-lock.test.ts`, `facade-types.test.ts`, `drop-in-type-surface-lock.test.ts`, `drop-in-require-shape-lock.test.ts`, `competitors-lock.test.ts` |
| R5 | **Built** 2026-10-20 — 44,683 B bundled against `@inquirer/prompts` 8.7.3's 582,754 B (0.077) | `subpath-weight` table, `apps/docs/content/docs/weight.mdx` | `subpath-weight-lock.test.ts`, `caique/src/weight.test.ts` |

Both minors published on 2026-10-25: burgee's (`.changeset/burgee-migrate-inquirer-prompts.md`) in
1.7.0 (Version PR #1231) and caique's (`.changeset/caique-inquirer-prompts.md`) in 1.5.0
(Version PR #1237). The intent is `shipped`; the evidence is in its *Shipped* section.
