---
"burgee": patch
---

A `--json` envelope is now `ok: false` when the command returned a non-zero `exitCode`, and it keeps `data`. `burgee check` on a refused plugin and `burgee migrate` with refusals present printed `ok: true` and exited 1, so an agent reading `ok` saw a pass. `ok` now matches the exit status on every path, as `--mcp`'s `isError` already did. A thrown failure is unchanged: `{ ok: false, error }`. (D-20261008-ok-follows-exit-code)
