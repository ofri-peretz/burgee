---
'closeout': minor
---

Shutdown is now bounded on every path out of a program, and a breach says which handler did
not come back.

**The deadline reports.** When the clock expires the process still leaves — with the code it
was already leaving with — and the report names **every handler that had not returned**, by
the caller's `label`, the function's own `name`, or `(anonymous)`. A plugin's handlers are
named `"<plugin>:<handler>"`. `run()` resolves with that report (`{ path, signal, code, error,
timedOut, unfinished }`), and `install({ onTimeout })` is where the line goes; the default
writes it to stderr. A hang used to be silence; it is now a diagnosable event with a name in
it.

**`Infinity` and `0` are refused** at `install()` / `createRegistry()` — not at the shutdown
they would have ruined — with a `USAGE`-class error carrying a `fix`. One waits forever; the
other gives no asynchronous handler a turn. Both reintroduce the failure the package exists
to remove.

**Three more doors.** `beforeExit`, `uncaughtException` and `unhandledRejection` now run the
handlers, and `SIGNALS` gains `SIGQUIT` and `SIGBREAK`. No incumbent in this layer listens for
a throw or a rejection, which is why a CLI that crashes mid-render leaves the cursor hidden.
A program with its own crash handler keeps deciding what happens next — closeout stands its
own listener down and counts before exiting, exactly as it already did for signals.

**One record, three renderings.** A handler is handed `{ path, signal, code, error }`, where
`path` is `'exit' | 'beforeExit' | 'signal' | 'uncaught' | 'rejection'`, and `reportToJson()`
and `reportToEvent()` project that same value for a `--json` line and an agent event.

**`once(fn)`** arrives as `closeout/once`: `onetime` + `mimic-fn` — 262 M downloads a week
between them — in 441 B with no dependency, preserving `name`, `length` and `this`.
`closeout/cursor` is the other new leaf, 666 B, for a program that only needs to put a cursor
back.

**The exit code is the program's.** It is captured at the trigger, before any handler runs, so
a handler that sets `exitCode = 0` on its way past cannot turn a `process.exit(3)` or a
SIGTERM into a success.

Existing callers are unaffected: `onExit(handler)` and `onExit(handler, 'flush')` both still
work, and the handler's argument gained fields rather than losing any. The published bundle
got *smaller* — comments are now stripped from `dist/`, 46,066 B down to 20,417 B — and every
entry point is on a byte ratchet.
