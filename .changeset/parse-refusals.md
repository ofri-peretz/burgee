---
"burgee": minor
---

A native command (`defineCommand`, `defineProgram`) refuses input it used to drop. Both are usage errors, exit 2, before anything runs:

- **More positionals than the command declares.** `demo greet ada extra` against a command that takes one argument now says `too many arguments: expected 1, got 2 ("extra")`. Before, `extra` was silently dropped and the run exited 0. A variadic last argument still takes the rest, and words after `--` are still `passthrough`.
- **A single-value option given twice with different values.** `--level info --level debug` now says `--level was given twice: "info" and "debug"`. Before, `info` was silently dropped. The same value twice is still accepted, as are `multiple` options and booleans, and a value from the environment or config never conflicts with a flag.

Both messages are in the locale catalog, so a locale pack translates them; `--json` stays English.

A command that forwards its tail to a child process declares `allowExcess: true` to keep today's behaviour: the surplus reaches `ctx.positionals`, and `--schema` publishes `excess: true` for it. The commander and yargs drop-ins are unchanged.
