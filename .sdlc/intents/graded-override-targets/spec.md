# Design — Every stand-in is graded

Intent: [`intent.md`](./intent.md). **Status:** approved.

**Accepted by the owner, 2026-10-12, by instruction: create and execute.** The instruction is
recorded verbatim in [`next-wave-2026-10.md`](../../research/next-wave-2026-10.md), with the
evidence this design rests on.

> Requirement ids are `R1`… so they cannot collide with the floor ids `scripts/run-evals.ts`
> reads from `burgee/spec.md`.

---

## Requirements

- **R1 — A lock: no README claims a grade the oracle does not hold.**
  `scripts/graded-claims-lock.test.ts` reads every published package's `README.md`. Under
  `## Compatibility`, each third-level heading that names a subpath in code (`pkg/subpath`) must map to a `DROP_INS` row whose
  host has a `GRADED` row, or its section must say "not graded" in those words. The lock
  also reads every `src/*.ts` header that says "override target for X" or "drop-in for X" and
  holds it to the same rule. It lands first, red on `3a05dc8aad` for `seniority/find-up`, so it
  ships with the README corrected to "not graded yet". R2 then removes that sentence.
- **R2 — `find-up`, graded against `seniority/find-up`.** Vendor `find-up`'s suite at its latest
  major. `seniority/find-up` already exports `findUp`, `findUpSync`, `findUpMultiple` and
  `findUpMultipleSync`, so the drop-in is the existing subpath. Add the host to
  `packages/compat-oracle/src/hosts.ts` and the row to `GRADED`, `GRADED_VERSIONS` and
  `DROP_INS`.
- **R3 — `onetime`, graded against a new `closeout/onetime`.** It is a façade with onetime's
  default export and `callCount`, over `closeout/once`. If onetime's suite imports
  `mimic-function` behaviour (name and length preserved), that is graded as part of this row,
  and `mimic-function` gets its own row only if `closeout/onetime` exports its API.
- **R4 — `cli-cursor`, graded against a new `closeout/cli-cursor`.** It is a façade with
  cli-cursor's default `{ show, hide, toggle }`, over `closeout/cursor`. It is restored on exit
  through closeout's registry, as cli-cursor does through restore-cursor.
- **R5 — `cli-truncate`, graded against a new `linegauge/cli-truncate`.** It is a façade with
  cli-truncate's default export and options (`position`, `space`, `preferTruncationOnSpace`,
  `truncationCharacter`), over `linegauge/truncate`. The README's "checked case by case" sentence
  is replaced by the grade.
- **R6 — `widest-line`, graded against a new `linegauge/widest-line`.** It is a façade with
  widest-line's default export, over `linegauge/widest`.
- **R7 — `picocolors`, graded against a new `roundel/picocolors`, behind a weight gate.** It is
  a façade with picocolors' `createColors`, `isColorSupported` and the colour functions, over
  `roundel/tokens` and `roundel/policy`. **Measured before it publishes:** its bundled bytes go
  into `subpath-weight`'s table against picocolors' own. Over the ceiling, the subpath stays
  private and this file records the number. It is the only requirement here with a kill
  criterion, because picocolors' whole pitch is its size.
- **R8 — Each row is level with its control, or the gap is named.** A case the target fails and
  the control passes is either fixed or excluded by exact title, with a reason on the
  compatibility page. Rule 3's ratchet applies from the first published number.

## Design

**One incumbent per PR, in this order:** R1, then R2 (find-up, the false claim), R3 and R4
(closeout, sharing a registry), R5 and R6 (linegauge), and R7 last (the weight gate decides it).
Each PR is the same mechanical slice the 28 existing hosts took:

1. `npm run compat -- --vendor <name>` vendors the suite at the version
   `npm view <name> version` names, recorded in `GRADED_VERSIONS`.
2. A host entry in `packages/compat-oracle/src/hosts.ts`: `name`, `repo`, `testDir`, `testGlob`,
   `imports` (upstream specifier → family subpath, with `control: '<name>'`), `runner`,
   `target`, `status: 'active'`.
3. `npm run compat -- <name>` and `npm run compat -- --control <name>` write the grade, and `GRADED` takes the row from it, never
   by hand.
4. `DROP_INS` gains `{ host, from: '<name>', to: '<pkg>/<subpath>' }`, so `burgee migrate`
   rewrites it, and `migrate-drop-ins-lock` holds it to the oracle.
5. The package's `exports`, `subpath-weight`'s table, the README's compatibility table (it is
   generated) and a patch changeset.

**Façades, not renames.** `closeout/cursor`, `linegauge/truncate` and `linegauge/widest` keep
their own APIs: they are the family's design, and other packages import them. The incumbent's
shape lives in a file named for it, as `closeout/exit-hook` and `paratext/terminal-link` already
do. A user switching gets the incumbent's shape. A user starting fresh gets the family's.

**The lock reads the same tables the generator writes.** R1 imports `GRADED` and `DROP_INS` from
`packages/burgee/src/compat.ts` rather than keeping a list, so a host added later is covered the
day it lands.

## Verification

| R | Check | Proven red by |
| :-- | :-- | :-- |
| R1 | `scripts/graded-claims-lock.test.ts` | running it on `3a05dc8aad`: names `seniority/find-up` |
| R2–R7 | `npm run compat -- <name>` and `-- --control <name>`, and `packages/burgee/src/compat-baseline-lock.test.ts` | the control run itself: the suite against the real incumbent must pass, or the row is refused. Before the façade exists, the target run fails to import |
| R2–R7 | `scripts/migrate-drop-ins-lock.test.ts` | a `DROP_INS` row added without a `GRADED` row fails it |
| R3–R7 | `scripts/subpath-weight-lock.test.ts` | a façade over its ceiling fails it. R7 is the case this can actually stop |
| R8 | `scripts/compat-page-subtractions.test.ts` | an exclusion with no reason, or a title that no longer exists upstream, fails it |

The whole loop is `npx vitest run --config vitest.root.config.ts` plus `npm run compat`, both
non-zero on failure.

## Rejected alternatives

- **Strike the README sentence and stop.** It makes the page true and leaves 953 M downloads a
  week with code and no number. The fix the principle asks for is the grade.
- **Grade the existing subpaths directly, changing their APIs to the incumbents'.** It would
  break every family import of `closeout/cursor` and `linegauge/truncate`, and make the family's
  own API whatever six upstream authors chose.
- **Raise `roundel/tokens`' ceiling if picocolors does not fit.** `u5-weight-claim` rejected
  this ("changing the instrument"). A miss is recorded, not absorbed.
- **One PR for all six.** Each vendors a suite and moves `GRADED`; six in one diff cannot be
  reviewed, and one red control would block the other five.

## Out of scope

- `mimic-function` as its own row, unless R3's export list makes it one.
- `supports-color`, `is-interactive`, `ci-info` and `log-symbols`: `roundel` folds environment
  detection but no subpath claims any of them as a drop-in. The table records no claim to grade.
- Re-pointing an `overrides` recipe at a package root (D-133). An override aims at a root, and
  each of these is a subpath, so they are reached by `burgee migrate`, not by `overrides`.

## Status

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | Not built | `scripts/graded-claims-lock.test.ts` | itself |
| R2 | Not built | `seniority/find-up` | `npm run compat -- find-up` |
| R3 | Not built | `closeout/onetime` | `npm run compat -- onetime` |
| R4 | Not built | `closeout/cli-cursor` | `npm run compat -- cli-cursor` |
| R5 | Not built | `linegauge/cli-truncate` | `npm run compat -- cli-truncate` |
| R6 | Not built | `linegauge/widest-line` | `npm run compat -- widest-line` |
| R7 | Not built | `roundel/picocolors` | `npm run compat -- picocolors`, `subpath-weight-lock` |
| R8 | Not built | the compatibility page | `scripts/compat-page-subtractions.test.ts` |
