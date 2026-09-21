---
"linegauge": patch
"seniority": patch
---

The Unicode segmenter is built on first use rather than at import, and both packages now
strip comments from what they publish.

`new Intl.Segmenter()` loads ICU's grapheme-break data. Two were constructed at module
scope, and almost nothing paid for them: every caller takes the ASCII fast path first, so a
run of printable ASCII — a help screen, a flag name, a path — never reaches `segment()`.
`segmenter` is now a function; the two call sites become `segmenter()`.

`linegauge` and `seniority` were also the two published packages whose build never ran
`strip-comments` at all. Unpacked: linegauge 83,538 → 56,148 and seniority 193,682 →
139,793.

Together these take `import 'burgee'` from 56.87 ms to 44.39 ms, medians of seven.
