---
"burgee": minor
---

A missing value that declares a prompt is left to the handler's prompt binding, and every handler
learns whether the run is `--json` (caique R1, R6).

- An option or positional that declares `prompt` (caique's `promptFor` sets it) is no longer
  refused by the engine when it is missing. The binding wrapped around the handler asks a person
  for it, or refuses naming the flag. Help still marks it required, and so does `--schema`.
- `ctx.json` is `true` when the caller asked for `--json`, which an `--mcp` tool call always does.
  A prompt binding reads it as "nobody is here to type", and flagstaff's `hoist` reads it as its
  `json` mode.
