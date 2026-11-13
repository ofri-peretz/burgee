---
'oxmutate': minor
---

`oxmutate run --ignore-static` skips static mutants (module-level code), as the `ignoreStatic` config key already did: the run is faster and the score leaves them out. The summary now says what the static phase cost, or how many mutants `ignoreStatic` left out, and names the flag once that phase is half the run.
