---
"bellpull": patch
"burgee": patch
"caique": patch
"closeout": patch
"controlroom": patch
"flagstaff": patch
"linegauge": patch
"paratext": patch
"roundel": patch
"seniority": patch
---

Published declarations now keep each doc comment's first paragraph, its code examples and its `@param`, `@returns`, `@throws`, `@example`, `@deprecated`, `@default` and `@see` tags, and drop the longer design notes below them, so the tarballs are smaller (burgee by 5.7% gzipped, bellpull and closeout by about a fifth). Types are unchanged, and hover text in an editor keeps its summary. `burgee`'s README also names `burgee/program-schema.json`, the JSON Schema every `--schema` document validates against.
