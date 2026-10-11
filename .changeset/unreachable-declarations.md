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

The tarball no longer carries declaration files that no `exports` entry reaches. TypeScript could never open them, because a deep import is refused by `exports`. Every entry's types are unchanged. The ten packages drop 71 files and 118,312 bytes between them, burgee 35 files and 76,504 bytes, which takes its tarball from 251,814 to 225,278 bytes gzipped.
