---
"oxmutate": minor
---

A mutant whose covering tests cost more to arm warm than a fresh worker costs to start goes to a fresh
worker at once, with no warm run first, and so does a static mutant whose loader files' tests cost more
than its live run. The estimate is read from the dry run (`src/fresh-first.ts`): a mutant's covering tests'
own time, from 49 ms of it, and for a static mutant the time of every test of the files that load it, from
278 ms. A fresh worker's verdict is the reference one, so nothing about such a mutant is confirmed later.
On `pathe` that is the `glob.spec.ts` mutants and the static ones that load it: the warm phase drops from
27 s to 6 s, the static phase from 51 s to 0.8 s, and the run from 199 to 230 s on 2.9.0 (219 s on the
release before this) to 91 s, with the same verdicts a fresh worker gives; `ufo`, `defu` and `gen` run as before. `OXMUTATE_FRESH_FIRST=1` sends
every covered mutant fresh, `=0` none. The report gains `stats.freshChosen`, `staticFresh`, `warmByFile`,
`freshByFile`, `freshFirst` and `dryFiles`, the figures the estimate rests on.

A failed step in the middle of a container install (`corepack enable && pnpm install && …`) now stops the
sync. It did not: the shell ignores a failing command in the middle of an `&&` chain under `set -e`, so the
install's stamp was written and the volume was never installed again, keeping whatever oxmutate it had.
