---
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

The family plugin schema (`schema.json`, identical in every plugin host) now describes `locales`, burgee's locale-pack key. A plugin carrying `locales` validates against the shared schema as it does against `burgee/locale-pack-schema.json`, which lists every message id. This package reads nothing new, and a plugin carrying `locales` registers here as before.
