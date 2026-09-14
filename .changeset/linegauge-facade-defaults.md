---
'linegauge': minor
---

Give `linegauge/strip`, `linegauge/wrap` and `linegauge/slice` a default export, each the
same function object as the subpath's named export.

The three packages they replace — `strip-ansi`, `wrap-ansi`, `slice-ansi` — all publish a
single function as their default, so `import stripAnsi from 'linegauge/strip'` now reads
exactly like the import it replaces. The root default is untouched and still `width`: that
one is spent on the `string-width` override recipe and cannot move.

This is what unblocked grading those three suites. Their tests open with
`import x from './index.js'`, and without a default the generated shim does not fail a case,
it fails to link — measured at `# tests 0 / # pass 0 / # fail 2` on eight cases the
implementation already satisfied. All three now grade: `strip-ansi` 8 / 8, `wrap-ansi`
80 / 80, `slice-ansi` 13 / 15.
