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

`caique check` refuses a widget whose `static` projection throws on its own sample with `E_COMPONENT_THREW`, the code `flagstaff check` already uses, instead of listing the error and printing `ok`. bellpull refuses a resolver `when` key it does not read (`when: { env: … }`) with `E_PLUGIN_SCHEMA`; it used to accept one and apply the resolver everywhere. The family `schema.json` every package ships now says the same: a resolver's `when` allows only `platform` and `envAny`.
