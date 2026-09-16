---
'flagstaff': patch
---

`flagstaff` no longer carries its own copy of "put the cursor back however the process dies". `src/cursor.ts` is deleted and its three consumers — the `ora` façade, the `log-update` façade and the loop's `tty` projection — reach `closeout` instead, which owns `restore-cursor` and `signal-exit` and grades 6 / 6 against `restore-cursor`'s own suite. That module's own header argued there is exactly one correct implementation of this and that a second copy is a second place to get it wrong; it was the second copy. There was a third, in `caique`.

The two façades use `closeout/restore-cursor`, whose contract is the one their incumbents grade: the stream is a property of the *process* — stderr if it is a terminal, else stdout — decided when you call, and written at exit whatever `isTTY` says by then. The projection uses `closeout`'s `onExit` in the `restore` phase, because it draws on the stream the Runtime handed it and must not learn that `process` exists. `closeout/exit-hook` is deliberately **not** used: it is faithful to its own incumbent, which never registers SIGHUP, so a closing terminal would not have reached the restore.

**A defect went with it.** The deleted module held a process-wide `cursorRestoreInstalled` flag — first caller installs the net, every later caller gets a no-op. That reads like a guard against a duplicate restore. It was a lost one: the second surface's writer was never registered, so a program with a hoisted frame on stdout and a spinner on stderr hid two cursors and put back one, leaving stderr's hidden. Measured on the previous build at `stderr { hide: 1, show: 0 }`. Registering per caller fixes it, and `src/cursor-net.test.ts` grades both halves — every hidden stream restored, and the one redundant (idempotent) show that two surfaces on a single stream now write.

No compatibility row moves: ora 99 / 99, log-update 99 / 99, boxen 84 / 84. None of those suites kills the process, which is why the guarantee is graded by flagstaff's own signal cases against the built `dist/` in a child that is really signalled.

`flagstaff` now depends on `closeout`. The per-entry weight measurements fall — `.` −1,666 B, `./loop` −1,666 B, `./ora` −1,591 B, `./log-update` −1,591 B — and **nothing got lighter**: the walk stops at a bare specifier, so the code left the measurement while staying in the program. Installed bytes go up, not down.
