# Design — a vendor run reads the tree it writes to

Intent: [`intent.md`](./intent.md). **Status:** approved.

---

## Requirements

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | **Built** | `vendor-suite.ts` resolves `hosts` relative to its **own file**, not by bare specifier | `vendor-suite-resolution.test.ts` |
| R2 | **Built** | the resolved path is asserted to be inside the script's own repository, and the run exits non-zero naming both paths when it is not | same |
| R3 | **Built** | reproduced from a directory with no `node_modules`, which is the only place the bug is visible | same |

## Design

The script imports its host registry by bare specifier, so Node walks upward from the
**current working directory** until it finds a `node_modules/compat-oracle`. From a worktree
with none of its own, that walk leaves the worktree and lands in the parent checkout.

The fix is to resolve **relative to the script's own location** — `new URL('../packages/…',
import.meta.url)` — which cannot leave the tree the script was loaded from, and then to assert
that what was loaded is under that same root. Belt and braces, because the first half is a
property of the code and the second is a property of the run.

Refusing is the fallback, not the goal: if the two disagree, the message names both absolute
paths, because "resolved the wrong tree" is unintelligible without seeing which two.

## Verification

`npx vitest run --root packages/compat-oracle vendor-suite-resolution` — and the case that
matters runs the resolution **from a temporary directory with no `node_modules`**, which is
the only configuration where the bug exists. A test that only runs in an installed checkout
is how this survived long enough to bite two agents in one afternoon.

## Rejected alternatives

- **Requiring `npm ci` in every worktree.** It is the workaround both agents found by hand.
  It makes correctness depend on remembering, which is what a silent failure punishes.
- **Detecting the wrong tree by comparing file contents.** Two checkouts of the same commit
  are byte-identical, so it would pass exactly when the bug is hardest to see.

## Out of scope

The same bare-specifier shape elsewhere in `scripts/`. Named here so it is not forgotten;
fixing it needs the same treatment per call site and a survey first.
