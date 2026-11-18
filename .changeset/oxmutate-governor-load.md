---
"oxmutate": minor
---

The governor's load hold: while the load average, less oxmutate's own busy servers, is past `resources.maxLoad` (default 1.5 × cores; `--max-load`), no new unit starts, until it falls under 80% of that. One server always runs, and a unit already running is never stopped. Where the OS reports no load average (Windows), busy cores are read from CPU time. Servers now start at a lowered OS priority; `resources.priority: 'normal'` (`--priority normal`) keeps the normal one. The summary reports how long starts were held.
