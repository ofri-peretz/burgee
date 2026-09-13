---
'closeout': minor
---

closeout runs your exit handlers exactly once, on every path

The package existed as a reserved name exporting a string constant. It now does the job
its description has always claimed.

A program leaves by several doors — returning from `main`, `process.exit`, SIGINT, SIGTERM,
SIGHUP — and a handler registered on `'exit'` alone catches one of them. That is why Ctrl-C
so often leaves a hidden cursor, a half-written file, or a lock nobody released.

- **`onExit(handler)`** — runs once, on every path, and returns the function that
  unregisters it. Two signals, or a signal and the `'exit'` behind it, are one shutdown.
- **`hideCursor(stream)`** — hides the cursor and registers the restore **in the same
  call**, so the two cannot drift apart. Returns the show function, which also unregisters.
  Idempotent, and silent on a non-TTY, because escape sequences in a pipe corrupt the output
  the pipe carries.
- **A deadline**, two seconds by default. A handler awaiting something that never resolves
  turns Ctrl-C into a process the user kills twice, and the second one is SIGKILL with no
  cleanup at all. Abandoning a slow handler is the better trade.
- **`createRegistry`** and **`install({ process })`** — the shutdown logic with no process
  attached, and the wiring pointed at one that is not the global. Every case in the suite
  runs without a real signal.

One handler's failure is its own: a throw is reported and the rest still run. Shutdown is
the worst place for an exception to short-circuit a loop, because the handler that restores
the terminal is usually registered last.

Importing the package attaches nothing — the process-wide instance installs on first use.

Still to come: raw mode and alternate-screen restore, and the graded drop-in paths for
`signal-exit`, `exit-hook` and `restore-cursor`.
