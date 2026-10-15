---
'caique': minor
---

A list prompt never outgrows the terminal. The raw `select` and `multiselect` draw a list longer
than the screen as a window that follows the cursor, with `↑ N more` and `↓ N more` rows for
what is outside it, so a repaint never climbs above the top row. The window is the new
`maxItems` on a prompt spec, clack's name for it, and never more than the terminal's rows less
three. `renderList` takes `maxItems`, and the terminal `Writer` reports `rows`, read live.
