---
"oxmutate": minor
---

The incremental cache can no longer reuse a stale verdict, and it checks itself on every run.

- **The fingerprint now covers everything the verdict rested on:**
  - every project file the covering tests evaluated (their module graph, recorded in the dry run);
  - the test files that load a static mutant's module (before, a static mutant's fingerprint was its source alone);
  - oxmutate's version, Node's version, the lockfile, and the options that decide a verdict.

  Before, a change to a helper module a test imports left the cached verdict in place.
- **Each run decides 5% of the reusable verdicts afresh.** If any disagrees with the cache on detected or not, the cache is rebuilt from that run (`stats.auditSampled`, `stats.auditDisagreed`).
