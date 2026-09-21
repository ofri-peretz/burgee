---
"seniority": minor
---

`seniority/lilconfig` and `seniority/rc` — two new drop-in subpaths, and `seniority/dotenv`
grows the default export its incumbent has.

`seniority/lilconfig` is lilconfig 3.1.3's surface: `lilconfig`, `lilconfigSync`,
`defaultLoaders`, `defaultLoadersSync`, and **no fifth runtime export**, because lilconfig's
own suite compares the module's keys against cosmiconfig's. Graded at **67 / 77** against that
suite, up from 0 — the same number its control scores, so no case in it now separates the two.
The zero was not a missing feature: the row had been pointed at the package *root*, which
presents cosmiconfig's surface and answers `lilconfigSync is not a function` seventy-seven
times.

`seniority/rc` is rc 1.2.8's merge with none of its four dependencies: the file stack in rc's
own order, `__` nesting for environment keys, JSON-with-comments, `deep-extend`'s merge, and
`configs` / `config` reporting which files were read. INI is refused by name with the argument
that would parse it, the way YAML already is. Its environment arrives as an argument rather
than off the process, which is the one divergence and the reason its compat row stays at 0 / 1.

`seniority/dotenv` now has a default export carrying `config`, `parse` and `populate`, so a
CJS caller `require()`ing it gets the same mutable object `require('dotenv')` gives — which is
what dotenv's own suite stubs. `populate` also matches 17.4.2 more closely: it validates
`parsed` (not `processEnv`), returns the keys it actually set, and logs under `debug`. The row
moves **74 / 141 → 80 / 141**.
