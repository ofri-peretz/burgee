---
"linegauge": minor
---

The root's `width` follows string-width 9.0.0, graded 466 / 466 by its own suite (control 466 / 466). The same code measured 308 / 466 before the port.

- A lone surrogate is `U+FFFD`, which a terminal draws.
- A prepended concatenation mark such as `U+0600` ARABIC NUMBER SIGN is a column, unless a wide glyph after it takes the mark into its own cell.
- A cluster that opens with Hangul is the width of its first code point.
- A cluster that opens with an emoji is two columns. That includes a lone or unpaired regional indicator and a digit with `U+FE0F`.
- A wide BMP emoji with `U+FE0E` is one column.
- A stray skin tone is a two-column swatch.
- An Indic conjunct, and Thai or Lao AM, count every visible code point up to a joiner.

New entry: `linegauge/v8`. It is string-width 8.3.0's measurement, graded 233 / 233 by that release's suite, for a project pinned to string-width 8. `slice`, `wrap`, `truncate`, `widest`, `linegauge/cli-truncate` and `linegauge/widest-line` keep measuring by it, because slice-ansi 10.0.1, wrap-ansi 10.0.2 and cli-truncate 6.2.0 still resolve string-width 8, and slice-ansi's suite asserts 8's answers (129 / 129, unchanged).

Against string-width 9.0.0, measured with `npm run bench` on darwin arm64 (Node 24.13.0, a loaded machine):

- One symbol bundles to 6,647 B against 6,845 B.
- 1,000 mixed lines take 0.741 of string-width's time. The printable ASCII, Latin-1, kana, Han and Hangul syllables at each end of a string are counted without the segmenter.
- Cold start is 14.2 ms faster: 44.6 ms against 59.5 ms.
