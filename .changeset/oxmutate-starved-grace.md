---
"oxmutate": patch
---

A fresh run held to its test's limit ([#1759](https://github.com/ofri-peretz/burgee/pull/1759)) is given 3x that limit in place, once,
when its worker is busy but under half a core (blocked in a call, or starved by a loaded machine), as a warm run
is: its stop at the small limit killed the server and re-ran at that same 3x. On a loaded machine that turned a
test that passes into a Timeout where the whole-mutant budget had held it (one `pathe` mutant, `_glob.ts:461`,
under 56 busy loops: a Timeout at 5 s where the old budget held to 65 s). A loop that burns its core is still
stopped at the limit.
