---
id: D-20261018-commander-14-budget
subject: '`burgee/commander/v14`''s per-entry budget follows the shared front-end up by its measured amount'
taken: Taken
date: '2026-10-18'
superseded_by: —
---

**`./commander/v14`'s budget in `weight.test.ts` moves from 112,700 B to 112,750 B. Its bundled
ratchet on `/docs/weight` moves down, from 56,010 B to 55,997 B.**

D-20261012-commander-14-budget set the entry at 112,700 B: the 112,645 B a local build read on
2026-10-13, plus the ~32 B CI reads heavier, rounded up to the next 50 B. Since then, two PRs
merged to main and changed the shared front-end that the entry re-exports:

- #1083, `facade-projection-fidelity` R5–R6 (command aliases), and
- #1091, `facade-projection-fidelity` R3 (an Argument's choices).

## The measurement, 2026-10-18, on `feat/previous-majors-commander-14` merged with main at `8284292`

| entry | `weight.test.ts` walk | `/docs/weight` bundled |
| :-- | --: | --: |
| `./commander` | 112,024 B (was 111,958) | 55,648 B (was 55,661) |
| `./commander/v14` | 112,711 B (was 112,645) | 55,997 B (was 56,010) |

The walk counts every byte of `dist/` the entry reaches. It grew 66 B on both entries. The
bundle is what esbuild keeps after minifying and tree-shaking, and it fell 13 B on both. The gap
is unchanged: v14 is still 687 B over `./commander` in the walk and 349 B in the bundle. Nothing
of v14's own grew.

## Why a raise and not bytes found

The 66 B are in `command.ts` and `schema.ts`, which this PR does not touch. The only room in
v14's own 687 B would be shortening more local names past the two already shortened (`args`,
`forSub`). That makes 14's message harder to read against upstream, and it would have to be
redone for every byte the shared front-end gains. `./commander`'s own budget (129,400 B) was not
raised for the same 66 B, because it has the room. The `burgee/commander` bundled ratchet is not
raised either, and this PR lowers v14's.

The raise is the measured amount: 112,711 + 32 = 112,743, rounded up to the next 50 B, which is
**112,750**.
