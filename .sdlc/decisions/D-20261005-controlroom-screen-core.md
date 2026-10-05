---
id: D-20261005-controlroom-screen-core
subject: 'controlroom: the screen core''s five choices the spec left open (R4–R7, R19)'
taken: Taken
date: '2026-10-05'
superseded_by: —
---

1. **`--json` events are flagstaff's shape: `{ event: <pane>, state }`**, not the spec's
   `{ event, pane, state }`. R15 puts every byte through flagstaff, and flagstaff's one NDJSON
   writer names an event by its component. Each pane is hoisted under its own name, so the
   pane *is* the event. Committed text is `{ event: 'commit', state: <text> }`. A second
   NDJSON writer in controlroom to add a field would be the second render path R15 forbids.
2. **A terminal whose stdin cannot go raw gets the static session** (`cmd < file` in a
   terminal). R4 says only `tty` with a raw-capable stdin opens a screen; the static session
   is chosen by handing flagstaff the runtime as not-a-TTY, rather than a second policy.
3. **A collapsed pane takes no rows or columns.** The layout part keeps its place in the tree
   at size 0, so expanding it restores the arrangement exactly.
4. **Inline, the live region is as tall as what it shows**: trailing blank rows are trimmed.
   A layout that wants space under its content asks for it with a fixed size.
5. **The alternate screen has no scrollback**, so text committed there is kept and written to
   the main screen once the alternate one is left. Inline commits take the live region's place,
   are released into scrollback, and the region is painted again under them (R19).
