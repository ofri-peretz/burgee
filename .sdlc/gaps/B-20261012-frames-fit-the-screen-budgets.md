---
id: B-20261012-frames-fit-the-screen-budgets
section: B
status: open
source: frames-fit-the-screen R1–R5
recommendation: 'raise four per-entry budgets by what the clip and the window measured: flagstaff `.` 29,300 -> 30,100 and `./loop` 7,000 -> 7,700; caique `.` 20,000 -> 20,800 and `./raw` 9,000 -> 9,700. The B4 bundled claims do not move: no entry in `benchmarks/fixtures/entry-points.ts` reaches `projection.js` or `raw.js`'
---

`frames-fit-the-screen` was built on 2026-10-12, red first and then green, and none of it fits
the per-entry weight budgets it lands under. Budgets are ratchets that only an owner raises, so
the build stopped and nothing was merged. Measured with `weight.test.ts`'s own walk over built
`dist/` (comments stripped):

| entry | main | budget | headroom | with the change | over by |
| :-- | --: | --: | --: | --: | --: |
| `flagstaff` `.` | 29,266 | 29,300 | 34 | 30,043 | 743 |
| `flagstaff/loop` | 6,910 | 7,000 | 90 | 7,688 | 688 |
| `caique` `.` | 19,952 | 20,000 | 48 | 20,788 | 788 |
| `caique/raw` | 8,896 | 9,000 | 104 | 9,660 | 660 |

R1–R3 cost `projection.js` 777 B (4,573 -> 5,350): the height read at every paint, the tail
kept under a `muted('… N more')` line, the clipped frame written whole on `release`, and a full
repaint when the height changes. `flagstaff/loop` is `loop.js` and `projection.js` and nothing
else, so no tightening elsewhere makes room, and any place `hoist` can reach is in that entry.
R4 costs `raw.js` 764 B and `terminal.js` 72 B (the writer's live `rows` getter, without which a
real terminal never windows). R5 is a test that holds today's static bytes; it guards R2's clip
and was held back with it.

The checks that failed first and passed after, kept in the PR that opened this gap:
`packages/flagstaff/src/projection.test.ts` (8 failing on main: a 50-line frame on 20 rows
climbs 49 rows; a resize 20 -> 60 leaves the clipped view) and `packages/caique/src/raw.test.ts`
(7 failing on main: `renderList` returns 41 lines, and the repaint climbs 40 rows on a 10-row
screen).

Closes when the owner rules on the four budgets, and R1–R5 merge under them.
