# Intent — Every stand-in is graded: six incumbents with code and no number

> Stage 1 artifact. Opened from the next-wave ranking
> ([`next-wave-2026-10.md`](../../research/next-wave-2026-10.md)), where it ranks first because
> one of its findings is a published sentence that is false today.

**Status:** shipped · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz · **Shipped:** 2026-10-19, verified against `main` at `326907eca6` — all 4 criteria checked; SC3's fixture landed with `migrate-older-majors`

---

## What is wanted

Every subpath in the family that is written to stand in for a named incumbent is graded by that
incumbent's own test suite, through `compat-oracle`, with a control run, the same as the 28
incumbents already graded. A README never says a path is graded when no suite holds it, and a
lock fails the commit that makes it say so.

When this lands, `burgee migrate` and the `overrides` recipe can take six more incumbents out of a
user's tree — `find-up`, `onetime`, `cli-cursor`, `cli-truncate`, `widest-line` and `picocolors` —
each backed by a pass rate, not a sentence. Together they are 953 M downloads a week.

## Why now

**A README claim that no suite holds.** `packages/seniority/README.md`, under `## Compatibility`:
*"Each path is graded by its incumbent's own suite, run unmodified through `compat-oracle`"*. The
same section documents `seniority/find-up`. `ls packages/compat-oracle/vendor/` has no `find-up`,
and `GRADED` in `packages/burgee/src/compat.ts` has no `find-up` row. Rule 3 of `PRINCIPLES.md`
says "Compatible" is a number, never a sentence. Here it is a sentence.

**Five more stand-ins with no grade**, found by reading each package's source headers and README
against `GRADED` (`packages/burgee/src/compat.ts`, 28 rows on `3a05dc8aad`). Weekly downloads are
`api.npmjs.org/downloads/point/last-week/<name>` for 2026-10-03..09:

| subpath today | incumbent | weekly | where the claim is written |
| :-- | :-- | --: | :-- |
| `seniority/find-up` | `find-up` | 328,874,020 | `seniority/src/find-up.ts` header: "the override target for `find-up` and the three packages under it" |
| `closeout/once` | `onetime` (with `mimic-function`) | 154,953,569 | `closeout/src/once.ts` header: the restore-cursor → onetime → mimic-fn chain is "incomplete without" it |
| `closeout/cursor` | `cli-cursor` | 126,679,709 | `closeout/README.md`: the six incumbents "one problem" |
| `linegauge/truncate` | `cli-truncate` | 54,392,889 | `linegauge/README.md`: "checked case by case against `cli-truncate` in `truncate.test.ts`" — honest, ungraded |
| `linegauge/widest` | `widest-line` | 41,152,765 | `linegauge/README.md` names it among the incumbents |
| *(none)* | `picocolors` | 246,727,715 | `roundel/spec.md` R8 sets `roundel/tokens`' ceiling at picocolors' bytes; picocolors #70 (35 reactions, ESM) is the most-reacted open issue across the ten output-stack trackers |

`linegauge` says its truncation is ungraded, plainly; that is honest and still a missing number.
`seniority` says the opposite of the tree, and that is the defect.

## Affected users and systems

- **Users:** anyone whose lockfile carries these six, which is nearly every Node project, and
  anyone who copies an `overrides` recipe from a family README.
- **Packages:** `seniority`, `closeout`, `linegauge`, `roundel` (a new `roundel/picocolors`
  subpath), and `packages/compat-oracle` (six vendored suites, six hosts).
- **Generated:** the compatibility page, each package's README benchmark block, `DROP_INS` and
  so `burgee migrate`, and `competitors.json` per package.
- **Published numbers that move:** the graded-incumbent count on every front page (28 today).

## Constraints

- **The incumbent's suite runs unedited**, apart from the import specifier the vendor step
  rewrites, exactly as for the 28 graded today. A case is subtracted only by its exact title,
  with a reason on the compatibility page (`Exclusion.exact`, as D-152 and
  D-20260930-caique-clack-core-exclusion did).
- **A control run proves each gate**: the suite against the real incumbent, in the same run.
- **No subpath is heavier than the incumbent it replaces** (`U5`; `scripts/subpath-weight-lock.test.ts`).
  `picocolors` is the hard case: if `roundel/picocolors` cannot meet picocolors' bundled bytes, it
  does not publish, and the measurement is recorded instead.
- **Zero external dependencies** in every published package. A suite's own test dependencies
  (`ava`, `tsd`) live at the workspace root, as `vendored-suite.test.ts` already requires.
- **Where an existing subpath's API differs from the incumbent's**, the drop-in is a separate
  façade subpath named for the incumbent, the pattern `closeout/exit-hook` and
  `paratext/terminal-link` already follow. The existing subpath's API does not change.

## Success criteria

1. `npx vitest run --config vitest.root.config.ts scripts/graded-claims-lock.test.ts` passes, and
   is proven red on `3a05dc8aad`, where it names `seniority/find-up`.
2. `GRADED` carries rows for `find-up`, `onetime`, `cli-cursor`, `cli-truncate`, `widest-line` and
   `picocolors`, each level with its control or with every subtracted case named by exact title.
3. `DROP_INS` maps each of the six, `scripts/migrate-drop-ins-lock.test.ts` passes, and
   `burgee migrate` rewrites a fixture importing all six.
4. Each new subpath is at or under its incumbent's bundled bytes, held by
   `scripts/subpath-weight-lock.test.ts`, or it is not published and `spec.md` says why.

## Shipped — 2026-10-19

**Status raised to `shipped`.** Every requirement was built on 2026-10-11 (`spec.md` › Status) and
`roundel/picocolors` is published (`roundel@1.1.3`). The roadmap-to-shipped reconciliation found one
gap: criterion 3's "`burgee migrate` rewrites a fixture importing all six" had no fixture. It is
added in the `migrate-older-majors` PR. It passes on `main`, because the rows were there; it was
shown red with the six `DROP_INS` rows taken out of `MAPPING`, the state before this intent.

| criterion | check | result |
| :-- | :-- | :-- |
| 1. `graded-claims-lock` passes, red on the unfixed tree naming `seniority/find-up` | `scripts/graded-claims-lock.test.ts` | passes; red on `e04e05e7f3` (`spec.md` R1) |
| 2. `GRADED` rows for the six, each level | `packages/burgee/src/compat.ts`, held by `compat-baseline-lock.test.ts` | find-up 104 / 104, onetime 6 / 6, cli-cursor 8 / 8, cli-truncate 12 / 12, widest-line 1 / 1, picocolors 1 / 1, each equal to its control |
| 3. `DROP_INS` maps each, `migrate-drop-ins-lock` passes, and migrate rewrites a fixture importing all six | `scripts/migrate-drop-ins-lock.test.ts`; `migrate.test.ts` › `A12 — rewrites a project importing find-up, onetime, cli-cursor, cli-truncate, widest-line and picocolors, each to its graded stand-in` | passes; the fixture moves all six, refuses nothing, and names all six removable |
| 4. each subpath at or under its incumbent's bundled bytes | `scripts/subpath-weight-lock.test.ts` | passes |

## Open questions

- Whether `roundel/picocolors` can meet picocolors' bytes. **Answered 2026-10-12 in `spec.md`**:
  measure first (R7), and a miss is a recorded non-publish, not a raised ceiling.
- Whether `mimic-function` gets its own row. **Answered 2026-10-12 in `spec.md`**: only if
  `closeout/onetime` claims it, which R3 decides from its own export list.
