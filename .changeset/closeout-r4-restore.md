---
"closeout": minor
---

Terminal restore now covers all three things design R4 promises: raw mode off, alternate screen left, cursor shown — last, on every exit path.

- `alternateScreen(stream)` enters the alternate screen (`ESC[?1049h`) and registers leaving it in the `restore` phase; the returned function leaves it early. `rawMode(input)` turns raw mode on and registers turning it off; an input that was already raw belongs to somebody else and is left alone, now and at exit. Both sit beside `hideCursor`, run their undo at most once, and write nothing to a non-TTY. `closeout/cursor` exports the leaf forms and `ENTER_ALTERNATE_SCREEN` / `LEAVE_ALTERNATE_SCREEN`.
- Fixed: a process whose shutdown was waiting on a handler that holds nothing in the event loop could leave through `'exit'` before the deadline without ever running the `restore` phase. Node's `'exit'` now invokes every phase the shutdown had not reached yet, each still exactly once.
