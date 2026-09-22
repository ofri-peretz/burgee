---
'bellpull': patch
---

The matrix suite no longer leaks a `SIGTERM`-ignoring child when a hook times out.

Two of its fixtures are pinned open by a `setInterval` and one declines `SIGTERM` on purpose —
it is the control case for R2, the whole reason `startDeadline` has a second rung. That rung is
a timer in the *parent*, so a parent that dies first never fires it: when a hook in the file
timed out, vitest tore the worker down and left the child spinning. One was found hours later
with its temp directory already deleted out from under it.

The leak paid for itself in the wrong direction. Every timed-out hook left a process that made
the next timeout likelier, which is why this suite read as merely load-sensitive (D-091) and
degraded over a long session rather than flaking at random.

Both fixtures now carry a 60-second self-limit — far longer than any case here, whose deadlines
are in the hundreds of milliseconds, and far shorter than *until the machine is rebooted*. The
two `afterAll` teardowns get the 60 s budget every other filesystem- and process-touching hook
in the file already had. `fixture-lifetime.test.ts` reads the fixture sources and refuses a
long-lived one without its own limit; it fails on the unfixed file.

No change to `bellpull`'s published behaviour — this is the suite, not the package.
