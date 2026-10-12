---
"caique": minor
"burgee": patch
---

`--quiet` reaches `caique/clack`'s decoration. Every clack call's options take an optional `runtime` (roundel's policy `Runtime`, which is burgee's `ctx.runtime`). When it says `quiet`, `spinner`, `tasks`, `intro`, `outro`, `note` and `log.message`, `info`, `step`, `success` and `warn` write nothing, and the spinner arms no interval; their lifecycle methods still run. `log.error` and `cancel` still write, and prompts ignore `quiet`. A call without a `runtime` behaves exactly as before, and quiet is never read from argv or the environment. `isCI()` takes an optional runtime to read `CI` from.

burgee's README shows the call under For agents: `spinner({ runtime: ctx.runtime })`.
