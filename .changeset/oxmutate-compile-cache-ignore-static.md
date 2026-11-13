---
'oxmutate': minor
---

`oxmutate run --ignore-static` skips static mutants (module-level code), as the `ignoreStatic` config key already did: the run is faster and the score leaves them out. The summary now says what the static phase cost, or how many mutants `ignoreStatic` left out, and names the flag once that phase is half the run.

Every server a run starts, and the workers under it, use Node's on-disk compile cache, in one directory under the temp directory shared between runs. Set `NODE_COMPILE_CACHE` to choose the directory, or `NODE_DISABLE_COMPILE_CACHE` to turn it off.
