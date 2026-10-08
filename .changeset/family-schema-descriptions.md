---
"burgee": patch
"bellpull": patch
"caique": patch
"closeout": patch
"controlroom": patch
"flagstaff": patch
"linegauge": patch
"paratext": patch
"roundel": patch
"seniority": patch
---

The family `schema.json` describes what five values look like. `contract` is `1`, and burgee refuses a plugin that declares none. A caique widget's `static(spec)` gets `{ kind, message, ...sample.done }`. A seniority `rank` sits between the built-in layers at flag 0, environment 10, config file 20, `package.json` 30 and default 40. A burgee hook's `filter` is `{ command: RegExp }`, now with `command` required, so the schema and the host refuse the same filters.
