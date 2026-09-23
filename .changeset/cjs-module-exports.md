---
"bellpull": patch
"flagstaff": patch
"burgee": patch
---

`require('bellpull/cross-spawn')`, `require('flagstaff/cli-table3')` and `require('burgee/yargs')` now return what `require('cross-spawn')`, `require('cli-table3')` and `require('yargs')` do — the function, the class, the factory — instead of an ES module namespace. Each exports its default as `'module.exports'`, which is what Node hands a CommonJS caller, and which yargs' own entry already does. `const spawn = require('…'); spawn(…)` threw before.
