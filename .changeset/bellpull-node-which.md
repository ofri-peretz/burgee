---
'bellpull': minor
"burgee": patch
---

`bellpull/node-which` is a drop-in replacement for node-which 7: `which(cmd, opts)` returns a promise and `which.sync` runs synchronously, with node-which's `all`, `nothrow`, `path`, `pathExt` and `delimiter` options and its `ENOENT` error. It passes node-which's own test suite, 5 of 5. `bellpull/which` is unchanged: it stays bellpull's own resolution API and never reads the process.

`require('bellpull/node-which')` returns the function with `.sync` on it, as `require('which')` does, and `burgee migrate` now rewrites `which` to it.
