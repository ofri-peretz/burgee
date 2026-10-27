---
"compat-oracle": patch
---

Every spawn goes through `bellpull/cross-spawn` (`src/spawn.ts`), so `npm` starts as `npm.cmd` on Windows without a shell, and the tsd and uvu runners' end-to-end suites run there. Grades are unchanged. Private, never published.
