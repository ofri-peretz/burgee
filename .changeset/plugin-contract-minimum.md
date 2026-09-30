---
"bellpull": patch
"caique": patch
"closeout": patch
"paratext": patch
"roundel": patch
"seniority": patch
---

A plugin that declares `contract: 0` or a negative contract is now refused with `E_PLUGIN_CONTRACT`, as `schema.json`'s minimum of 1 always said. These hosts checked only that a contract was not newer than the one they know, so 0 and below registered.
