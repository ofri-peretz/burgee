---
"oxmutate": minor
---

Memory cleanup you can configure, in container mode and on the host.

- `resources.workerMemoryLimit` (`--worker-memory-limit`): a warm Vitest server holding more than its ceiling once a unit is done (its own memory and every process its tests started) is recycled, and the warm spare takes its slot, so a long run gives memory back instead of ending in an out-of-memory kill. No verdict changes. `'auto'` (the default) is 80% of the run's memory limit across the servers wherever the run has one (a cgroup limit, or the container oxmutate starts), and off elsewhere; it also takes a share (`'25%'`), a size (`'1.5g'`, `800` MiB) or `'off'`. The summary names how many servers were recycled and the most one held.
- `container.cleanup` decides what a run leaves behind: `volume` (`keep`, `remove`, or `keep-on-failure` to look inside after a failed run; `--container-volume`), `failed: 'keep'` to keep a failed run's container for `docker logs` (`--keep-failed-container`), and `interrupt` (`--keep-on-interrupt`).
- Every container of a run carries the run's own label, and SIGINT, SIGTERM or SIGHUP (Ctrl-C, a CI timeout, an agent stopping its job) removes exactly that run's containers before oxmutate exits 130, 143 or 129. Before, a SIGTERM to the host left the test run going in the engine, holding its memory.
- A run whose container ends 137 is read back for the kernel's out-of-memory kill and says which limit it hit (`container.memory`, or the engine's VM) and what to change; a kill from outside says so instead.
- `container.tmpSize` caps the `/tmp` tmpfs `readOnly` gives, whose pages count against `container.memory`.
