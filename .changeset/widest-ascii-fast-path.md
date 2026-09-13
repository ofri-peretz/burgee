---
'linegauge': patch
---

`width` measures printable ASCII without the segmenter.

`widest` walks one `Intl.Segmenter` per line, so its own 200,000-line case — the
one proving `widest` survives where `Math.max(...lines.map(width))` throws
RangeError — timed out at five seconds.

Nothing that makes `measure` correct applies between 0x20 and 0x7E: no escape
sequences, no combining marks, no emoji. For those strings the column count is
the code-unit count. Everything else falls through unchanged, so the grapheme,
emoji and east-asian rows are untouched.

ASCII is the common line a CLI measures, so this is the fast path for nearly
every caller rather than a carve-out for one test.
