---
"controlroom": minor
"bellpull": patch
"burgee": patch
"caique": patch
"closeout": patch
"flagstaff": patch
"linegauge": patch
"paratext": patch
"roundel": patch
"seniority": patch
---

controlroom hosts plugins (R10): `keymaps` and `panes` register through `controlroom/plugin`'s `register()` against the family schema, a screen takes either by name, and `controlroom check <plugin-file>` reports what a plugin contributes. The family schema every host ships gains the `keymaps` and `panes` definitions.
