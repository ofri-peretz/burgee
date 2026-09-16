---
'bellpull': minor
---

`bellpull` was a reserved name exporting one string. It now runs programs.

`run(cmd, args, { runtime })` returns a `Result` — `{ ok, code, signal, stdout, stderr, duration, command, args, executable, timedOut }` — for **every** outcome a process can have. A non-zero exit resolves with `ok: false`; the promise rejects only where no process ran, which is a missing executable or a failed spawn. `execa` throws on a non-zero exit, so every caller wraps it and every wrapper rebuilds these same fields out of the error; this repository already had two of those, in `compat-oracle/src/run.ts` and `vendor.ts`, both reading a result through a `catch`.

`timeout` is finite by default (30 s) and the kill is a ladder — `SIGTERM`, then `SIGKILL` after a grace window — because a child that traps `SIGTERM` makes a single-signal timeout a timeout that times nothing out. Output written before the kill is kept: a CI timeout with the output discarded is undiagnosable.

`bellpull/which` resolves an executable and reports **which `PATH` entry answered**, which is the open position in this layer — `which` + `isexe` + `path-key` is 779 M downloads a week across three packages and none of them returns it, and neither zero-dependency rival in the spawn layer resolves at all. Two `PATH` entries are refused rather than searched: an empty one, which POSIX reads as the working directory and is the oldest privilege-escalation trick there is, and a relative one, whose meaning changes with wherever the program was run from. `searchPath()` reports each skip with its reason rather than quietly doing less than its author expected.

`bellpull/cross-spawn` is the drop-in, graded **68 / 68** by `cross-spawn`'s own vendored suite against a control of 68 / 68 on the same machine (macOS, 2026-09-15). On POSIX it is a pass-through, because `cross-spawn` is one — everything it is famous for is Windows-only, and a façade that "improved" on the pass-through would change the error a caller sees and the process tree. The Windows half invokes `cmd.exe` itself with `windowsVerbatimArguments`, having quoted each argument for `CommandLineToArgvW` and caret-escaped every `cmd.exe` metacharacter. It never sets `shell: true` to solve a Windows problem; `shell` is available, off by default, and documented as the injection surface it is.

`bellpull/plugin` hosts **`resolvers`** (`plugin-contract` R5a, PLAN 1.5) — how an executable is found, since `which` is the part every environment does differently. A resolver is `{ rank, paths, extensions?, when? }` and carries **no function at all**, so it survives JSON and a `plugin check` can print a search order without running anything; `{VAR}` in a path is substituted from the environment, the way paratext templates an OSC payload. A path that is not absolute after substitution is refused at `register()`, because a resolver's directories are searched ahead of `PATH` and a relative one means a different directory every time the program runs from somewhere else. Ships `bellpull/schema.json`, byte-identical to flagstaff's (R2).

Zero dependencies on every entry point, and `bellpull/which` is a leaf that loads two files. Installed, tree-inclusive: 82,270 bytes against a ceiling of 714,984 for `execa` + `cross-spawn` + `which` — a ratio of 0.1151, up from 0.0067 when the package did nothing, which is the honest direction.

Not built, and said rather than implied: `execa`'s streaming API and its template-literal form are out of scope, and no number is claimed against `tinyexec`, which is not installed in this workspace.
