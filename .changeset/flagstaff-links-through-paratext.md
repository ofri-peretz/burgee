---
'flagstaff': minor
---

`flagstaff/box` and `flagstaff/table` render a path or a url as a terminal hyperlink, and `flagstaff` is the first package in the family to build on `paratext` (paratext R12).

A table cell may be `{ text, href }` and a box may be given `{ href }`. On a terminal believed to understand OSC 8 the text becomes a real hyperlink; on a pipe, in a log, under `TERM=dumb`, and for a screen reader it reads `src/index.ts (file:///repo/src/index.ts)` — the destination survives rather than being dropped with the escape, and no control byte reaches a file. Neither the guess nor the sequence is flagstaff's: both come from `paratext/link`, and `flagstaff` passes it a runtime instead of re-deciding.

`flagstaff/cli-table3`'s `hyperlink()` now builds its sequence the same way. It still emits unconditionally and byte for byte what upstream emits — that is the drop-in contract, and cli-table3 still grades 29 / 29 — but the escape itself is no longer written out a second time in this package. `src/link.test.ts` locks that: no published file here spells an OSC 8 sequence of its own.

`paratext/link` rather than `paratext`: 2,410 B and no registry against 20,221 B and `registerBuiltins()` at import, measured in paratext's own `dist/`. `flagstaff/table` grew 1,675 B and `flagstaff/box` 1,502 B; the two budgets in `weight.test.ts` moved with them and the reasoning is recorded there.
