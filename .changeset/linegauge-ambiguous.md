---
'linegauge': patch
---

`width` takes `ambiguousIsNarrow`. East Asian Ambiguous characters — `±`, `×`, `÷`, the
box-drawing set, Greek and Cyrillic — are one column in a Latin terminal and two in a CJK one,
and nothing can detect which a terminal is doing, so it is the caller's decision. Default
`true`, matching the incumbent. The 179-range table is generated from Unicode rather than
transcribed, with a `--check` that fails on drift. Graded: `string-width` 198 / 229 → **201 / 229**.
