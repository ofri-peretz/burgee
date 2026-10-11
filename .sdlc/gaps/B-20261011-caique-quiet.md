---
id: B-20261011-caique-quiet
section: B
status: open
source: agent-lint-conformance R2
recommendation: 'caique''s clack port takes an optional `Runtime` with `quiet` on `spinner`, `progress`, `tasks` and `log`, and draws nothing then; prompts keep asking, and the non-TTY refusal is unchanged'
---

`--quiet` silences what flagstaff draws (`hoist` reads `ctx.runtime.quiet`) and burgee's own
hints, but not caique's decoration. caique's clack port (`spinner`, `progress`, `tasks`, `log`)
reads `processRuntime()` itself and takes no runtime from the caller, so there is no seam to hand
`quiet` through. Choosing that seam is public API on a graded drop-in (clack's own suite grades
the port), which is why this is a decision before it is code. A prompt is not decoration: under
`--quiet` it still asks at a terminal and is still the same usage error in a non-TTY.
