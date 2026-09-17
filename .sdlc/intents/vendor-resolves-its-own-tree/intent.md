# Intent — a vendor run reads the tree it writes to

**Status:** approved · **Opened:** `2026-09-17` · **Owner:** `@ofri-peretz`

---

## What is wanted

`scripts/vendor-suite.ts` either reads the checkout it is writing into, or refuses and says
which two trees disagree. It never silently grades one tree's code against another tree's
host registry.

## Why now

`compat-oracle`'s design records this as **R6, `Not built`, confirmed live**. It bit two
agents on 2026-09-17, in the same session:

> This worktree had no `node_modules` — `npx tsx` was silently resolving `compat-oracle/hosts`
> from the **main checkout's `dist/`**, so my first two vendor runs wrote the wrong manifest.

and, independently:

> a worktree with no `node_modules` silently resolved `compat-oracle/hosts` from the main
> checkout's `dist/`

Both noticed by accident. A bare specifier resolves upward until it finds something, so a
worktree without `node_modules` reaches the parent checkout — and the run writes into its own
`vendor/` while reading another tree's definition of what to vendor. The output looks
completely normal.

This is the one defect class this package exists to prevent, turned inward: **a measurement
that reads a different thing from the one it reports on.** The same package already carries
`unsatisfiedPins`, written after a control graded 1/1 by resolving `rc` out of a stray
`/Users/…/node_modules`.

## Affected users and systems

`scripts/vendor-suite.ts`, and anyone running it from a worktree — which is every lane agent,
and the documented way this repository parallelises work. Downstream: every
`baseline/<host>.json` and every rate on the public compatibility page.

## Constraints

- **Loud failure is an acceptable outcome and may be the better one.** A wrong number that
  looks right is what this package exists to prevent.
- No external dependency (PRINCIPLES rule 2).
- Every compat row stays where it is; this changes how the tool resolves itself, not what it
  grades.

## Success criteria

1. Running `vendor-suite.ts` from a checkout with no `node_modules` either reads that
   checkout's own sources, or exits non-zero naming both paths.
2. A test reproduces the wrong-tree resolution — one that passes in a fully installed
   checkout cannot see this bug, which is exactly how it survived.
3. `npm run compat` — every row `▲ 0`.

## Open questions

None. The two failure reports agree on the mechanism and both name the same line.
