---
'flagstaff': minor
---

A live frame never outgrows the terminal. `frameWriter` reads the writer's `rows` at every paint
and clips a frame taller than the screen to its tail under one dim `… N more` line, so a repaint
never climbs above the top row and leaves lines it cannot erase. `release` writes the clipped
frame whole, so nothing it held is lost, and a change of height repaints from the top. A writer
without `rows` (a pipe) is never clipped, and the static projection is untouched. `Writer` gains
an optional `rows`.
