---
"bellpull": patch
"linegauge": patch
"paratext": patch
"seniority": patch
---

READMEs and package descriptions now match what each drop-in path is graded at. bellpull names `bellpull/node-which` as the drop-in for npm `which` (5 / 5) and no longer lists execa as a drop-in. paratext's ansi-escapes row is 4 / 4, with the CSI half implemented. seniority's rc row is 1 / 1, dotenv's `config()` defaults to `process.env`, and lilconfig is 77 / 77. linegauge documents `ambiguousIsNarrow` and `strip` as shipped. No code changes.
