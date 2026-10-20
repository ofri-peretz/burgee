---
"burgee": minor
---

A completer now sees the rest of the line ([yargs#793](https://github.com/yargs/yargs/issues/793)). `complete(partial, context)` gets a second argument, `context`, which holds:

- `path`: the command path.
- `options`: the options typed before the cursor, coerced the way a run coerces them.
- `positionals`: the positionals typed before the cursor.
- `raw`: any value that failed coercion, kept exactly as typed.

So a `--branch` completer can offer the branches of the `--remote` typed before it. The line is unfinished, so nothing is required, no relation is checked, and no env, config or default is read on TAB.

A positional can declare `complete` too. It is called for the slot the cursor is in, and a variadic positional is called for every slot from its own onwards.

The generated bash, zsh, fish and PowerShell scripts now pass the words before the cursor. A script generated before this change still completes options, because the call is the same, just with fewer words. A completer that takes one parameter is called exactly as before. The `CompletionContext` and `Completer` types are exported.
