---
"bellpull": patch
"burgee": patch
"caique": patch
"closeout": patch
"controlroom": patch
"flagstaff": patch
"linegauge": patch
"oxmutate": patch
"paratext": patch
"roundel": patch
"seniority": patch
---

The package manifest names its author and publishes with `publishConfig` `{ "access": "public", "provenance": true }`. burgee's `homepage` is its landing page, https://burgee.interlace.tools. oxmutate gains `keywords`, so npm search finds it, and a `sideEffects` list (its CLI, its worker and its Vitest runner run on load), so a bundler can drop the rest. No code changes.
