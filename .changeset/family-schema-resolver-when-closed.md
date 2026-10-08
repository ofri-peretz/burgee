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

The family `schema.json` closes a bellpull resolver's `when` with `additionalProperties: false`, so the schema and bellpull's own validation refuse the same unknown keys.
