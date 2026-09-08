---
'caique': minor
---

Add `caique/raw`: arrow-key `select` and `multiselect` on a terminal that can take raw mode.

`askList()` draws a moving highlight and repaints in place, and answers the same question
`ask()` does with the same value — line mode stays the floor, this is decoration on top,
and the suite proves the two agree by running one spec through both. `keyOf()` reads a
keypress, `canRender()` says whether a runtime can take raw mode, and `renderList()` is one
frame so the drawing is asserted rather than screenshotted.

`Ctrl-C` cancels — in raw mode it arrives as a byte, not a signal — and the terminal is
restored (raw mode off, cursor shown) whatever the answer.

No dependency on flagstaff: a prompt has no spinner, and the repaint it needs is three
escape sequences.
