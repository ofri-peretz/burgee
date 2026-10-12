---
"flagstaff": minor
---

`table()` takes `columns`, per-column `min` and `max` content widths, positional like `align`. A column with `max` never grows past it; a column with `min` is not narrowed below it while another column can give way, and when the mins add up past `width` the table is drawn wider rather than break them. Bounds that cannot hold (`min > max`, negative, fractional, `max` below 1) throw a `TypeError` naming the column. A table without `columns` draws exactly as before, and the static projection is unchanged.
