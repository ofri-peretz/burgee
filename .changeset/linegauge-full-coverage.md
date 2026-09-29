---
"linegauge": patch
---

Code no test could reach is gone, and nothing a caller can observe changes.

- `slice()`: the fallbacks for a character or code point read at an index that is always inside the string, and the check for a visible token the segmenter could not have skipped, are removed. The hyperlink bookkeeping no longer tracks "no position yet" before the slice starts — nothing has been emitted then, so taking an empty link back out removes nothing — and an empty link at the cut is taken out once, at the end, rather than twice.
- The SGR reader shared by `slice`, `wrap` and `truncate` drops the same kind of fallback, and a bounds check that a malformed-colour check after it already covered.
- `linegauge check`: an unused helper and an unreachable `?` in the report are removed.

The published entries that cut styled text are a little lighter; `linegauge`'s unpacked size goes from 102,495 to 102,004 bytes.
