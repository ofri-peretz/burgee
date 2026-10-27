---
id: D-20261027-gallery-whole-screen-replayed
subject: 'The Gallery shows each flagstaff component''s tty mode as its escaped bytes. A whole screen''s bytes are kilobytes of escapes. How does the Gallery show the reference dashboard in all five modes?'
taken: 'Taken by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-27, in feat/controlroom-close'
date: '2026-10-27'
superseded_by: —
---

**The dashboard's `tty` mode is shown as the screen a terminal shows: its bytes replayed onto an
80 × 24 grid by `scripts/screen.ts`, at two moments (mid-run on Status, and after → on Tail
logs). `pipe`, `ci`, `json` and `accessible` are shown as written, escapes made visible as `␛`,
one fenced block each. The run happens in its own process, `scripts/gallery-dashboard.mjs`.**

**Why replayed.** A flagstaff component's `tty` row is a few hundred bytes and reads as escapes.
The dashboard's two screens are 6,284 bytes of cursor moves, erases and synchronized-output
blocks: printed, they show nothing a reader can check against the wizard. Replayed, they show the
four tabs, the learn panel beside the checklist with `◼ ▷ ◻`, the log tail and the hint line —
what criterion 1 asks the Gallery to show. `screen.ts` knows only the sequences the family writes
(cursor moves, erase in line and display, save and restore, the alternate screen), and its own
test pins each one.

**Why its own process.** The dashboard registers a flagstaff plugin when it is imported, and the
registry is the process's: imported into `gallery-page.ts` it would restyle every flagstaff
sample on the page with `◼`. flagstaff has no unregister, and adding one for a docs page would
widen a published API for a script.

**The checks.** `gallery-page.test.ts` compares the page with a fresh render, as it always has,
and holds the section: all five modes, the wizard's layout in the `tty` screens, and no `␛` or
`␍` and no key hint in any other block.
