---
'linegauge': patch
---

Lock the two claims `linegauge` was making with nothing behind them: that its ASCII fast path
agrees with the path it short-circuits, and that `require('linegauge')` works.

`width()` has had two implementations of one answer since `slice` landed — `asciiColumns`
returns `s.length` for printable ASCII, everything else walks `Intl.Segmenter`. The design
has promised a `differential.test.ts` locking the two together since 2026-09-09, `index.ts`
still said the fast path was unbuilt, and no test compared them. Every existing case either
used an input the fast path rejects or one where both paths are trivially right, so widening
the fast path's range by a byte passed the entire suite. A wrong fast path is not a slow
program, it is a silently wrong measurement: a box a column short, a help column that stops
lining up, and nothing thrown.

`differential.test.ts` now asserts `width(s) === measure(strip(s))` over the intent's six-row
grapheme table, 24 boundary fixtures and 2 000 inputs from a recorded seed, and carries the
grapheme table itself as assertions — code units against cluster count against columns.
Proven red before green: widening the range to `0x7F` fails 2 cases and dropping its floor to
`0x00`, which lets `ESC` onto the fast path, fails 8.

`shape.test.ts` covers R12. Nothing in the tree had ever called `require` on this package,
and the override recipe it is built for — `overrides: { "string-width": "npm:linegauge@^1" }`
— lands it inside CommonJS trees that have required `string-width` since 2015. Every
published entry is now required from CommonJS, which proves both halves of R12 at once: Node
refuses a graph containing a top-level `await` with `ERR_REQUIRE_ASYNC_MODULE`, so a `require`
that returns the namespace is also the no-top-level-await check. Proven red by appending a
top-level `await` to `widest.ts`: 3 of 8 cases fail.

No behaviour change. 913 tests, up from 867.
