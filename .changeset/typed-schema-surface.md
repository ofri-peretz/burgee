---
"burgee": minor
---

Positionals are typed. An argument declares `type` (`string`, `number`, `integer`, `boolean`, `file`) and, on a string one, `choices`, and the handler reads it as `ctx.args.<name>`, typed from the declaration: `{ name: 'replicas', type: 'integer' }` is a `number`, a variadic argument an array, an absent optional one its `default`. `ctx.positionals` is unchanged. A word that fails its type or its choices is a usage error, exit 2, before the handler runs; its `fix` is the line with the one word replaced when exactly one value is right (`deploy stagin` → `deploy staging`, `2.6` → `3`). A native argument's `choices` are its `enum` in `--schema` and in the `--mcp` tool's `inputSchema`. Help prints a number option's `(minimum: n)` and `(maximum: n)`. An `--mcp` call that leaves out an optional positional now fills it with its default, or is refused when it has none, instead of handing every later value to the argument before it.
