# Design — `roundel/supports-color`, graded by supports-color's own suite

Intent: [`intent.md`](./intent.md). **Status:** approved.

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

`policy.ts` already decides a level from `(argv, env, isTTY)`. The drop-in is a thin module,
`src/supports-color.ts`, that calls the same internal level function with an `order:
'supports-color'` switch. That switch changes exactly one branch: whether `FORCE_COLOR` can
override a negative flag. Everything else, including the CI table and the `TERM` rules, is the
table that exists today. Nothing in `policy.ts`'s public API changes.

Order: R1, then R2 and R3 in one PR (a grade with no divergence test is a grade that can drift
silently), then R4 and R5.

## Verification

| R | Check | Shown failing first by |
| :-- | :-- | :-- |
| R1 | `npm run compat -- supports-color`; the baseline file under `packages/compat-oracle/baseline/` | the first run grades 0 against roundel, with the control level |
| R2 | the same command, level with the control; `scripts/supported-majors-lock.test.ts` | before the subpath, every suite file dies at import |
| R3 | `packages/roundel/src/supports-color.test.ts` (new): the two answers side by side | written before the switch: the drop-in answers 0 and the case fails |
| R4 | `npm run bench -- --axis weight --check`; `scripts/competitors-lock.test.ts` | the pair is added before the subpath is trimmed; the lock fails while `KNOWN` lacks the name |
| R5 | `packages/burgee/src/migrate.test.ts` | the case is added first and fails with "no mapping" |

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
