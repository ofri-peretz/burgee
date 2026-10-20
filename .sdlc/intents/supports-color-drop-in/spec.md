# Design — `roundel/supports-color`, graded by supports-color's own suite

Intent: [`intent.md`](./intent.md). **Status:** approved — built 2026-10-19; `shipped` when roundel's minor publishes.

**Accepted by the owner, 2026-10-12, by instruction: create and execute.** The instruction and the
evidence are recorded in [`next-wave-3-2026-10.md`](../../research/next-wave-3-2026-10.md).

> Requirement ids are `R1`… so they cannot collide with the floor ids `scripts/run-evals.ts`
> reads from `burgee/spec.md`.

---

## Requirements

- **R1 — The suite is vendored and runs against the incumbent.** `compat-oracle` gains a
  `supports-color` host at the current major's tag. Its control, supports-color graded by its
  own suite, is recorded as the baseline. No drop-in yet, so the grade against roundel reads 0.
- **R2 — `roundel/supports-color` exists and grades level.** The subpath's default export is
  `{ stdout, stderr }`, and `createSupportsColor(stream, { sniffFlags, streamIsTTY })` is a named
  export, each returning `false` or `{ level, hasBasic, has256, has16m }`, as the incumbent does.
  It reads `process.argv`, `process.env` and the stream through the table `policy.ts` already
  holds. `GRADED`, `DROP_INS`, `GRADED_VERSIONS` and `SUPPORTED_MAJORS` carry the row.
- **R3 — The divergence is the incumbent's on the drop-in only.** The `--no-color` with
  `FORCE_COLOR=3` case answers 3 on `roundel/supports-color` and 0 on `roundel/policy`. A test
  pins both answers side by side so a future refactor cannot merge them by accident.
- **R4 — Lighter in a bundle, and watched.** A B4 pair gates at 1. `roundel/competitors.json`
  declares supports-color with claim `compat`, and the `KNOWN` list in
  `scripts/competitors-lock.test.ts` names it.
- **R5 — `migrate` maps it.** The migration map rewrites the bare specifier and a deep
  `supports-color/browser` import (the browser entry answers `false` in Node, as upstream's
  does).

## Design

*Re-grounded 2026-10-19; the design as first written is kept below the line for the record.*

`src/supports-color.ts` is its own module: supports-color 11's decision table, in its order,
reaching only `runtime.ts` (the process seam) and `node:os` / `node:tty`. It never imports
`policy.ts`. It keeps supports-color's module state too: `--color` and `--no-color` read from
`argv` once, at import, and a call that sees `FORCE_COLOR` set writing it over that answer for
every later call. `runtime.ts` exports the guarded global as `proc` (7 B in `./chalk`'s graph,
which had 9 B to spare) so the drop-in reads `env`, `argv` and `platform` as supports-color does.
Nothing in `policy.ts` changes.

> *As first written:* a thin module calling `policy.ts`'s level function with an
> `order: 'supports-color'` switch that changes one branch.

Order: R1–R5 in one PR, which is how it was built.

## Verification

| R | Check | Shown failing first by |
| :-- | :-- | :-- |
| R1 | `npm run compat -- supports-color`; the baseline file under `packages/compat-oracle/baseline/` | the first run grades 0 against roundel, with the control level |
| R2 | the same command, level with the control; `scripts/supported-majors-lock.test.ts` | before the subpath, every suite file dies at import |
| R3 | `packages/roundel/src/supports-color.test.ts` (new): the two answers side by side | written before the switch: the drop-in answers 0 and the case fails |
| R4 | `npm run bench -- --axis weight --check`; `scripts/competitors-lock.test.ts` | the pair is added before the subpath is trimmed; the lock fails while `KNOWN` lacks the name |
| R5 | `packages/burgee/src/migrate.test.ts` | the case is added first and fails with "no mapping" |

## Re-grounded on `main` at `326907ec`, 2026-10-19

1. **The switch in `policy.ts` is dropped.** It changes more than one branch. supports-color's
   suite asserts the platform and Windows build (three cases), TeamCity (two), iTerm (two), and the
   level-3 terminals, all of which `colorLevel` refuses to read by design (its `ponytail:` note),
   and `colorLevel` honours `NO_COLOR` and `CLI_ACCESSIBLE`, which supports-color does not read.
   `./chalk` reaches `policy.ts` with 9 B to spare, so a switch there would also break R8 of
   `roundel`. The drop-in is a standalone table instead (Design above).
2. **The graded major is 11.** `dist-tags.latest` was 11.0.0 when R1 landed (published
   2026-07-26): a numeric `FORCE_COLOR` is an exact level and Node 22 is the floor.
   `SUPPORTED_MAJORS` claims `[11]`; no older major (D-145's rule).
3. **R1 needed an oracle change.** Every case sets the process and then re-imports `./index.js`
   with a query string. A shim of `export * from 'supports-color'` hands back the module it already
   evaluated, so the control would have graded the first case's environment 55 times.
   `HostImport.fresh` makes the shim import the module beneath it by URL with its own query.
4. **R5's deep import does not exist.** supports-color 11's `exports` is one entry: `node` →
   `index.js`, `default` → `browser.js`. `supports-color/browser` is not importable, so `migrate`
   maps the bare specifier only. `roundel/supports-color` has no browser condition, which is in
   *Out of scope* already.
5. **The verification for R2 adds a differential property test.** The suite pins 55 environments;
   `supports-color.test.ts` evaluates supports-color's own installed source in a `vm` against this
   module over 3,000 generated environments (variables, flags, platform, Windows build, TTYs, a
   stream and options, and an environment written after import), plus the R3 pair. It is what
   killed the mutants the 55 cases leave alive. supports-color 11.0.0 is a root devDependency for it
   and for the type-surface lock, as meow is.
6. **R4's B4 pair and the weight page disagree by method, and both are under.** B4 reads 1,764 B
   against 2,128 (0.829); the per-subpath page, `export *` plus the default, 1,781 against 2,145.

## Build status

Built on `feat/colour-drop-ins` against `main` at `326907ec`. Every check below was red first.

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | Built | `compat-oracle`: the `supports-color` host, `vendor/supports-color/` at `e2a4cd3c`, `HostImport.fresh` in `run.ts`, `baseline/supports-color.json` | control 55 / 55; target 0 before the subpath (`target not built yet`); `grade.test.ts` › a `fresh` import |
| R2 | Built | `roundel/src/supports-color.ts`, `./supports-color` in `exports` and `typesVersions`; `GRADED`, `DROP_INS`, `GRADED_VERSIONS`, `SUPPORTED_MAJORS` | `npm run compat -- supports-color` 55 / 55; `supports-color.test.ts` (differential); `drop-in-type-surface-lock`, `drop-in-require-shape-lock` |
| R3 | Built | the same module, and `policy.ts` unchanged | `supports-color.test.ts` › R3 — 3 on the drop-in, 0 on `roundel/policy`, side by side |
| R4 | Built | `benchmarks/fixtures/entry-points.ts`, `BUNDLED_CEILING` 1,850; `competitors.json` `./supports-color`; `KNOWN` | `npm run bench -- --axis weight --check` (red at a ceiling of 0, then 0.829 against ≤ 1); `competitors-lock` |
| R5 | Built | `migrate.ts` `FACADE_EXPORTS`; the Migrate page | `migrate.test.ts` › rewrites a supports-color default import |

**Built: 5. Not built: 0.**

## Rejected alternatives

- **Make `roundel/policy` itself the drop-in.** It would have to give up the refusal that
  `policy.test.ts` line 133 records as deliberate, which makes every roundel user less safe so
  that one case of a third-party suite passes.
- **Claim it from the existing tests without vendoring the suite.** The case-by-case tests
  are ours. A claim is the incumbent's own suite or it is a sentence (the rule wave 2's
  `graded-override-targets` R1 locks).
- **Fold `is-interactive`, `ci-info` and `log-symbols` in the same intent.** No demand number
  was measured for them in this wave, and each is its own graded host.

## Out of scope

- `has-flag`, which supports-color depends on. It is an internal of the incumbent, and the
  subpath does not export it.
- The browser-side colour detection beyond the `false` answer upstream's browser entry gives
  in Node.
- `chalk`'s `supportsColor` re-export. `roundel/chalk` already serves it and is graded.
