---
"bellpull": minor
"burgee": minor
"caique": minor
"closeout": minor
"flagstaff": minor
"linegauge": minor
"paratext": minor
"roundel": minor
"seniority": minor
---

Runs on Node 20 and 22, not just 24+: `engines.node` is now `^20.19.0 || >=22.13.0`. Those are the first releases where `require(esm)` loads without a warning, so the CommonJS `require()` path keeps working. Every package's test suite runs on exactly 20.19.0 and 22.13.0, on Linux, macOS and Windows. caique's prompts no longer call `Promise.withResolvers`, which Node 20 doesn't have.
