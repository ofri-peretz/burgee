---
"linegauge": patch
---

Faster at every entry point, with the same answers:

- `strip` is strip-ansi's own grammar in one pass, with its fast path for a string with no escape.
- `slice` segments lazily and stops at `end`.
- `width` and `wrap` measure each cluster once, and skip the emoji regexes for Latin, CJK and box-drawing clusters.

B5, ours ÷ incumbent: `slice` 8.7× → 0.76×, `width` 1.34× → 0.70×, `wrap` 1.82× → 0.73×, `strip` 4.3× → 1.0×. `flagstaff`'s log-update, boxen and cli-table3 drop to 0.39–0.72× on the back of it.

`width` and `strip` now also agree with string-width and strip-ansi on the edges the old two-pass strip answered differently: a C1 OSC, and `ESC [` before a byte that ends no sequence.

Bundles are lighter too: `linegauge` 6,448 → 5,653 B (0.94× string-width) and `linegauge/strip` 950 → 272 B (0.60× strip-ansi).
