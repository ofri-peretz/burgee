---
id: D-20261027-controlroom-zero-size-terminal
subject: 'A pseudo-terminal nobody gave a window size reports 0 × 0, and controlroom laid the screen out on zero rows and drew nothing. What does a size of 0 mean?'
taken: 'Taken by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-27, in feat/controlroom-close'
date: '2026-10-27'
superseded_by: —
---

**A size of 0 is no size: `live()` reads `rt.stdout.columns || 80` and `rt.stdout.rows || 24`,
where it read `?? 80` and `?? 24`. A patch release of controlroom.**

**How it was found.** Driving the reference dashboard on a real terminal from
`scripts/pty-host.py` (Python's `pty.fork()`), the program entered the alternate screen, painted
nothing for the whole run and left. `pty.fork()` sets no window size; `TIOCGWINSZ` answers 0 × 0,
and Node reports `columns: 0, rows: 0` as numbers, which `??` lets through. The same happens under
`docker run -t` before the first resize and under `script(1)` on some systems. Run under
`stty rows 24 cols 80` first, the same program drew every frame.

**Why `||` and not a positive-number guard.** flagstaff's frame writer already treats a
non-positive size as none (`columnsOf`, and `(out.rows ?? 0) > 0` in `paint`), so the two layers
now agree. A guard function cost 84 B against the root entry's 24,200 B budget (measured 24,233
B); `||` costs nothing, and Node never reports a negative size, so the only value the guard caught
that `||` does not is one no stream produces. `controlroom/ink` already read 0 as no size, as ink
does (`windowSize` in `src/ink/process.ts`).

**The check.** `screen.test.ts` › "reads a size of 0 as no size, and draws at 80 × 24", red on
`origin/main` (the replayed screen was `['']`), and `examples/dashboard`'s real-terminal case,
which drives the dashboard on a 0 × 0 pseudo-terminal.
