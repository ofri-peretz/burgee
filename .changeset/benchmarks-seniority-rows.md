---
"benchmarks": patch
---

B2 cold start times `seniority/lilconfig` against lilconfig and `seniority/dotenv` against dotenv, as paired differences: R9's bar for the first, gated with 2 ms of runner noise allowed, and a 10 ms ratchet for the second, which starts slower. B4 adds the discovery-chain row, `seniority/cosmiconfig + seniority/find-up` against `cosmiconfig + find-up` (find-up 8.0.0, pinned), gated on the bundle and on the installed tree. The benchmarks page draws every paired difference in a new table beside the ratios.
