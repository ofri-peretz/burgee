# Design — a vendor run reads the tree it writes to

Intent: [`intent.md`](./intent.md). **Status:** shipped.

---

## Requirements

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | **Built** | `vendor-suite.ts` imports its host registry **by path**, `../packages/compat-oracle/src/hosts.js`, never by bare specifier | `scripts/oracle-import-lock.test.ts`: *no script imports compat-oracle by package name* |
| R2 | **Built** *(restated 2026-10-19)* | the run reads this tree's registry wherever it is run from, so there is no second tree to name; `REPO_ROOT`, where it writes, is derived from the same file | `scripts/vendor-suite-resolution.test.ts`. *As first written:* "the resolved path is asserted to be inside the script's own repository, and the run exits non-zero naming both paths when it is not" |
| R3 | **Built** 2026-10-19 | reproduced from a directory with no `node_modules`, which is the only place the bug is visible: the real script and the oracle's sources copied into a temp tree, run through `tsx` by absolute path | `npx vitest run --root . scripts/vendor-suite-resolution.test.ts` — two real runs: inside a parent whose `node_modules/compat-oracle` declares a decoy host, and with no `node_modules` above at all. Each lists this tree's hosts and not the decoy |

**Built: 3 of 3.** Shipped 2026-10-19.

### Requirements restated

| R | As written | As built | Why it moved |
| :-- | :-- | :-- | :-- |
| R2 | "the resolved path is asserted to be inside the script's own repository, and the run exits non-zero naming both paths when it is not" | The registry is imported by path, so it cannot be another tree's; the assertion was deleted | R3's real run found the assertion was the defect. It probed `compat-oracle/hosts` **by name** — the resolution R1 had already removed from the imports — so from a worktree with no `node_modules` inside an installed checkout it refused a run that read its own registry (`refusing to run … reading its host registry from <parent>/node_modules/compat-oracle/hosts.js`), and from a tree with none above it died on `Cannot find module 'compat-oracle/hosts'`. Both runs fail on main and pass now. Refusing was the intent's acceptable fallback; reading the right tree is its first choice, and the tree now makes it |

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

`npx vitest run --root . scripts/vendor-suite-resolution.test.ts` — and the case that
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
