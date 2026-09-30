---
"roundel": patch
---

`roundel/chalk` is faster.

- A builder keeps the escapes it opens and closes with, built one pair at a time as its chain grows, instead of rebuilding them on every call.
- It reads its links as kept properties rather than through a Proxy trap on every access, and it skips the re-open and line-break passes a string doesn't need.
- In B5, ours ÷ chalk on the 10k-string workload went from 3.55× to 1.17×.
- `roundel/tokens` exports the pieces: `painter(at, pair)`, `painted(painter, text)` and `UNPAINTED`. `sgr(chain, text)` is unchanged.
- `./chalk` stays under chalk 6.0.0's own source size (9,361 of 9,370 B).
