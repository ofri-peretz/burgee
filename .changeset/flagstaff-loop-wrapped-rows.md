---
"flagstaff": patch
---

Fixed: `hoist()` on a terminal left stale rows behind when a frame was wider than the terminal. The tty projection counted the rows it had painted as lines of text, so a line that wrapped onto the next row was erased as one and the rows it wrapped onto stayed on screen under every repaint. It now counts painted rows with `linegauge`'s `lineCount` at the writer's `columns` (80 when the writer does not say), the measurement `flagstaff/ora` already clears by. `Writer` gains an optional `columns`, which `process.stdout` already carries.
