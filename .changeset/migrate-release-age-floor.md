---
"burgee": patch
---

`burgee migrate`: under a pnpm `minimumReleaseAge`, `next` pins each family package to the newest release of its graded major that is old enough to install (from the registry's `time` field), respects `minimumReleaseAgeExclude`, and says when the install will start working if no version is old enough yet. `releaseAge` gains `exclude` and `pins`.
