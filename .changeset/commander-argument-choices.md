---
"burgee": minor
---

`burgee/commander` publishes an `Argument`'s `.choices()` as `enum` on the positional, in
`--schema` and in `--mcp`'s `inputSchema`, the way an option's choices already are (a variadic
argument's go on its items). `ArgumentSpec` gains `choices`; native `defineCommand` does not
accept it yet, because its parser does not check a positional's value. Commander's own help and
parsing are unchanged.
