---
"burgee": minor
---

`burgee/commander` projects what a program already declares: `Option.choices()` becomes `enum` in
`--schema` and in `--mcp`'s `inputSchema` (and the values completions offer), `.hideHelp()` keeps
an option out of the input schema, help and completions, `.conflicts()` is published as `exclusive`
and in the command's `relations`, and an `Argument`'s string default reaches the positional's
`default`. Commander's own help and parsing are unchanged.
