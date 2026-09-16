---
'burgee': patch
---

The cliui backtracking gate stops measuring a ratio and measures one large case against a
budget with orders of magnitude of headroom.

**Three instruments have now failed on this one assertion.** An absolute `< 400 ms` at a small
size red-lit a CI box that returned 440 — a 10% margin is a statement about the runner. The
growth *ratio* that replaced it failed worse: **15.04 on macOS CI against 4.09 locally, for
identical code**, batched 256 times, so not noise.

The ratio's premise was wrong. Per call the CI runner was 3x slower at n and **11x slower at
4n**: a 48,000-character cell is 96 KB of UTF-16 where a 12,000-character one is 24 KB, so the
larger crosses a cache boundary the smaller does not. The ratio was measuring the memory
hierarchy, and no ceiling fixes that — linear code genuinely costs more than 4x once its input
stops fitting.

One size now, large, with a gap nothing about a machine can close. Measured: the linear
implementation renders a 200,000-space cell in **0.2 ms**; restoring the upstream
`str.replace(/ +$/, "")` renders it in **16,321 ms**. The budget is 1,000 ms — ~5,000x above
linear, 16x below quadratic.

That is what separates it from the `< 400 ms` that failed: not that it is absolute, but that a
reading cannot cross a gap this wide.
