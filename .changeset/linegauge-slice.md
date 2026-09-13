---
'linegauge': minor
---

`slice`, `truncate` and `widest`, over the style stack extracted from `wrap`. Cutting a
styled string in display columns never splits a grapheme cluster, never loses a combining
mark, and closes and reopens whatever styles the cut ran through. `truncate` measures the
ellipsis and keeps it inside the budget. Published as `linegauge/slice`,
`linegauge/truncate` and `linegauge/widest`, each isolated from the others.
