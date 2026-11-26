---
"hookset": patch
---

`hookset context` in the shared `hookset-check.yml` workflow runs again. Since 1.2.0 `context.ts` imported `./core.js`, which does not exist where the workflow type-strips the source from the tag, so the step failed with ERR_MODULE_NOT_FOUND in every repo pinned to 1.2.0 or 1.3.0. It now imports nothing relative and reads `stations.json` itself, and a test loads it the way the workflow does.
