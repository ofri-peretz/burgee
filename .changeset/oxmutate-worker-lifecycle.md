---
'oxmutate': minor
---

Workers no longer sit idle holding memory until a run ends. `resources.workerIdleTimeout` (ms, default 30,000; `--worker-idle-timeout`) closes a Vitest server that has had no unit for that long, the spare included, and starts a new one if work comes later; `0` keeps every server for the whole run, as before. `resources.warmWorkers: false` (`--cold-workers`) starts a server for each unit and closes it after: slower, and the least memory held. The summary names the servers closed for sitting idle. No server ever outlives its run.
