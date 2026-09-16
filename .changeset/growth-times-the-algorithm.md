---
'burgee': patch
---

The cliui backtracking guard is checked by shape rather than by clock, after three timing
instruments failed on it, each differently.

1. `< 400 ms` at a small size — a CI box returned 440. A 10% margin measures the runner.
2. A growth **ratio** read **15.04 on macOS CI against 4.09 locally for identical code**,
   batched 256 times, so not noise. Per call that runner was 3x slower at n and 11x slower at
   4n: a 48,000-character cell is 96 KB of UTF-16 where a 12,000-character one is 24 KB, and the
   larger crosses a cache boundary the smaller does not. The ratio measured the memory
   hierarchy, and no ceiling repairs that.
3. An absolute budget cannot work either, and the numbers say why: at n = 50,000 the quadratic
   implementation costs **1,072 ms here** while the linear one costs **~1,780 ms on CI**.
   Correct code on the slow machine is dearer than buggy code on the fast one, so no threshold
   separates them — and any threshold that passes CI cannot fail locally.

The bug is one shape: a quantifier with no anchor before it, matched against the row text, so
the engine retries at every position in a long run and each attempt walks to the end.
`cliui.ts`'s own comment records the cost — 1,049 ms of `toString()`'s 1,223 ms for a cell of
50,000 spaces, quadrupling when the cell doubled. The check now asserts that shape is absent:
deterministic, microseconds, no flake. Reintroducing `str.replace(/ +$/, "")` turns it red.

What it gives up is generality — it catches the shape rather than the behaviour, so a new
quadratic written another way would pass. That is stated in the test. Its first run also
matched the comment that documents the bug, which is why comments are stripped first: the third
checker in this repository to be caught reading printed source rather than shape.
