---
"linegauge": minor
"burgee": patch
---

linegauge: `linegauge/slice` is graded against slice-ansi 9.0.1's own suite (104 cases, up from 15 at 7.1.2) and passes all 104; East Asian Width is Unicode 17.

- `slice` rounds **inward** at a wide character, as slice-ansi does: a cluster the range only half covers is left out instead of returned whole. Before, `slice('あいう', 0, 3)` returned `あい` (four columns), and `truncate('あいう', 4)` returned `あい…` (five columns, over its budget). Both now stay inside the columns asked for.
- `slice` reads the escapes slice-ansi 9 reads: `OSC 8` links ended by `ESC \` or `U+009C`, the C1 `OSC` introducer, `DCS`, `SOS`, `PM` and `APC` strings, a lone `ST`, and truncated or malformed `CSI`. A malformed `CSI` ends at the first byte that cannot belong to it, so the text after it is kept.
- An escape inside a grapheme cluster (`e`, a style, then a combining mark) no longer splits the cluster.
- Hyperlinks don't nest: a second open replaces the first, and the first is closed with its own introducer and terminator. A link around no visible text is removed. A close just past the end of the range is kept as written, and an opener with no text after it is dropped.
- Where a cut lands, `slice` gives every cluster at least one position (so CRLF and zero-width characters can start or end a range) and a lone regional indicator two, as slice-ansi does. `width` is unchanged and still answers as string-width does.
- The Wide/Fullwidth table is generated from get-east-asian-width 1.7.0 (Unicode 17), like the Ambiguous table next to it. The hand-written table was missing 1,147 code points, which `width` measured as one column where string-width measures two.

burgee: `burgee migrate` serves slice-ansi 9 (its compatibility row moved from 7.1.2 to 9.0.1). slice-ansi 7 is still graded, at 14 of 15, but no longer claimed, so a project on slice-ansi 7 is left on it.
