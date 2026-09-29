---
"flagstaff": patch
---

Code no test could reach is gone, and nothing a caller can observe changes.

- `table()`: the column-shrinking loop no longer checks for a column already at the three-cell minimum — `table()` never offers less than that per column, so while the table is too wide its widest column is always wider than the minimum. The widths are found with `Math.max`/`indexOf` instead of an indexed loop with `?? 0` fallbacks that could not fire. Ties still go to the leftmost column. `flagstaff/table` is 342 B lighter.
- The terminal projection no longer keeps a placeholder cursor net for a `close()` without an `open()`, or for a second `close()`: `hoist()` opens first and lowers at most once, so neither can happen.
