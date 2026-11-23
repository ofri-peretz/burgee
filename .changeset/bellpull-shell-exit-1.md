---
"bellpull": patch
---

`run()` with `shell: true` on Windows no longer turns a command's exit 1 into `NotFoundError`.
The inference that `cmd.exe`'s exit 1 means "not found" needs a file bellpull resolved, and with a
shell bellpull resolves nothing, so every failing shell command read as a missing one. The shell
resolved it, and its exit code now stands. The `cross-spawn` drop-in keeps `cross-spawn`'s behaviour.
