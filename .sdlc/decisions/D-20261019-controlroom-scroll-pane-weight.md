---
id: D-20261019-controlroom-scroll-pane-weight
subject: 'What may controlroom''s root and `./plugin` entries weigh once a pane scrolls? (controlroom-scroll-pane R1–R6)'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets and trade-offs'
date: '2026-10-19'
superseded_by: —
---

**The root entry's budget goes from 21,000 B to 24,200 B, and `./plugin`'s from 4,200 B to
4,250 B**, in `packages/controlroom/src/weight.test.ts`, each rounded up to 50 B from what was
measured.

**Measured on this branch against `main` at `add9c3fd`**, by the lock's own walk over `dist/`:

| Entry | main | this branch | change |
| :-- | --: | --: | --: |
| `.` | 20,485 | 24,149 | +3,664 |
| `./plugin` | 3,965 | 4,246 | +281 |

`./ink` did not move.

**What the bytes buy.** A live defect fixed: `fit` kept a pane's first rows and dropped the rest,
so no key could reach them. By file: `tabs.js` (scroll state, the six actions as a data table,
`settle`, `move`, the resize re-clamp, four glyphs for the hint line), `compose.js` (`fit` from
an offset, `extents()` for the reducer, the `↓ N` hint, and the static frame grown to every
line, R6), `plugin.js` (six default keys and their labels, all `./plugin`'s growth), and
`screen.js` (it hands the reducer the drawn heights, and re-clamps on resize).

**Trimmed before raising.** The step table is data, not six closures. `fit` and the hint share
one offset. Pane text is rendered once per frame for both the static unfold and the placement.
The keymap is two lines rather than twenty-two, since `dist/` keeps tsc's layout. A dead
`{ position: 'end' }` (linegauge's default) came out. Together these took the root from 24,552 B
to 24,140 B, and dropping a clamp `fit` already applies took it the rest of the way. Exporting `extents` and `Extent` from the root, so a program can call `reduce` with what it needs, adds 9 B.

**Rejected.** A `ScrollView` component holding its own offset, which the spec rejects for state
reasons, would not have been lighter: the static projection would still need to un-scroll it.
Leaving R6's static unfold out would save about 700 B and leave the inline screen's settled
frame cut at the page the person was on, which is the defect this fixes, moved into scrollback.
