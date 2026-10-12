---
"burgee": minor
"compat-oracle": patch
---

`burgee/commander/extra-typings` is a new entry point: a drop-in for `@commander-js/extra-typings`, graded 369 of 369 by its own tsd suite, level with the control. Its JavaScript re-exports `burgee/commander`, as extra-typings re-exports commander; its declarations are extra-typings 15.0.0's, ported with their MIT notice, so options and arguments are inferred from the strings that declare them and `.opts()` and an action's parameters are typed without a cast. `burgee migrate` now rewrites `@commander-js/extra-typings`.

It bundles to 61,207 B, what `burgee/commander` bundles to, against 39,329 B for `@commander-js/extra-typings` plus `commander`: the gap is open as B-20261012-extra-typings-bundles-heavier.
