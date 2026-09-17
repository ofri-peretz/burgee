---
'burgee': minor
---

`burgee/commander` spawns `executableSubcommand` through `bellpull`, and burgee no longer
imports `node:child_process` anywhere.

The gap was declared, dated, and carried its own release condition.
`inline-implementation-lock` read: *"commander's `executableSubcommand` spawns a sub-binary
and forwards five signals to it. Both are bellpull's job; bellpull was a seven-line
placeholder when this was written, and the engine lane adopts it once bellpull grades
against cross-spawn's suite."* It grades **68 / 68**.

What it buys a consumer is the Windows branch. Upstream commander sends **every** Windows
spawn through `node`, because `spawn` does not search `PATHEXT` and, since the fix for
CVE-2024-27980, Node refuses a `.cmd` without `shell: true`. That is a workaround for a
resolution problem, and it is wrong for a subcommand that is a `.cmd`, a `.bat`, or has a
shebang that is not node — a real program with a real sub-binary. `bellpull` resolves the
executable, builds the `cmd.exe /d /s /c` line itself and escapes every argument, so
nothing reaches a shell as text.

`ChildProcess` comes from `bellpull/cross-spawn` too, which re-exports it precisely so a
consumer does not have to name `node:child_process` for a type.

**commander stays 1360 / 1360, ▲ 0**, measured after the wiring — which is the whole
question, since `spawn` is mocked in roughly 23 of those cases and the earlier attempt at
this took the row to ungradeable. `bellpull/cross-spawn` reads `spawn` off its default
import for that reason, and this consumer reads it off the namespace at the call site.

Cost: **+1,097 B** on `./commander`, ratcheted at the measurement.
