---
'closeout': minor
---

`closeout` re-raises a signal instead of exiting `128 + n`, so a process killed by Ctrl-C now really dies of SIGINT rather than exiting 130. `WIFSIGNALED` is false for the old behaviour and true for the new one, and that difference is visible to everything upstream of the program: a shell knows to print `^C` and re-raise into its own job control, `make` stops a parallel build instead of carrying on, a CI runner marks a job cancelled rather than failed, and a supervisor decides whether to restart. 128 + n is the number a shell reports *afterwards*; it was never a status a process could set for itself.

The package used to argue the opposite in a comment — that re-raising "re-enters this listener", and that exiting explicitly is what a caller who owns `main` wants. The first half was already answered by the code around it: closeout removes its own listener *before* it counts, which is the same `unload()`-then-`process.kill(process.pid, sig)` shape `signal-exit` uses, and `signal-exit` is closeout's declared incumbent for this surface. The second half is a preference the incumbent does not share.

The stand-down guard is unchanged and now covers one more thing: the re-raise happens only when no other listener remains, so a program with its own `SIGINT` handler still gets the cleanup, still decides what happens next, and gets exactly **one** delivery for one Ctrl-C. A runtime that refuses to raise a given signal at itself — SIGHUP is `ENOSYS` on Windows — falls back to the POSIX code, because a shutdown that will not go is the one failure this package is named for.

`ProcessLike` now requires `kill(pid, signal)` and `pid`. This is a breaking change to that type for anyone calling `install({ process })` with a hand-written double, and it is deliberate: optional members would have let a fake quietly take the exit path, which is how the missing re-raise survived `exit-hook`'s 21-case suite and `restore-cursor`'s 6-case suite intact. Both suites still pass 21 / 21 and 6 / 6.

`closeout/exit-hook` is unchanged and stays faithful to its incumbent: it exits `128 + n` and listens on SIGINT and SIGTERM only — no SIGHUP — because `exit-hook@5.1.0` registers exactly `beforeExit`, `SIGINT`, `SIGTERM`, `exit` and `message`, and its own suite grades the exit codes. Use closeout's `onExit` rather than the drop-in when a closing terminal has to reach your cleanup; closeout's own wiring has covered SIGHUP all along.
