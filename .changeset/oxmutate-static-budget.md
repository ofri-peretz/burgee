---
'oxmutate': minor
---

`static.budgetMs` (`oxmutate run --static-budget <ms>`): the most the static phase may take. Once it is spent no static unit starts; a static mutant still undecided is reported `Ignored`, with the reason `static mutant (static budget spent)`, and left out of the score. A kill found before that stands, and nothing is called Survived on part of its test files. The summary line says how many were left undecided. Unset, there is no limit.
