---
"bellpull": patch
"flagstaff": patch
"burgee": patch
"seniority": patch
---

`require('bellpull/cross-spawn')`, `require('flagstaff/cli-table3')`, `require('burgee/yargs')`, `require('seniority/dotenv')` and `require('seniority/rc')` now return what the incumbent's `require()` does — the function, the class, the factory, the object — instead of an ES module namespace. Each exports its default as `'module.exports'`, which is what Node hands a CommonJS caller, and which yargs' own entry already does. `const spawn = require('…'); spawn(…)` threw before.
