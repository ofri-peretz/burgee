---
'burgee': minor
---

Help is coloured on a terminal, and `NO_COLOR` and `FORCE_COLOR` mean what they say.

The engine rendered help plain everywhere. That met "no ANSI in a pipe or under `NO_COLOR`" only by
never colouring at all, and it left `FORCE_COLOR` with nothing to override. Now one decision covers
every help path:

- `FORCE_COLOR` decides whenever it is set: `0` or `false` turns colour off, anything else (the
  empty string included) turns it on, even through a pipe and over `NO_COLOR`. This matches Node's
  own `getColorDepth`.
- Otherwise help is coloured only on an interactive terminal with no non-empty `NO_COLOR` and a
  `TERM` other than `dumb`. **A detected agent is not an interactive terminal**, so Claude Code,
  Cursor and the rest still read plain help even when they have a TTY.

Colour adds ANSI and nothing else: stripped, coloured help is byte-identical to the plain render,
and `NO_COLOR=1` gives back the plain render exactly.
