# caique

**Not yet released.** This version reserves the name; the first working release follows
[`docs/intents/caique/`](https://github.com/ofri-peretz/burgee/tree/main/docs/intents/caique).

A **caique** (kah-EEK) is a small, loud, never-silent parrot — and this one always answers
back. It is also the light wooden boat of the Bosphorus and the Greek islands, the one that
runs between the ship and the shore carrying people and messages across the gap. Both are
true of this package: it is the go-between that carries a question from a program to whoever
is calling, human or agent, and brings the answer back. **It never hangs.**

## What it will be

- **Every prompt is a flag first.** A caller who passes the flag is never asked. An agent
  answers before the question, on the command line, in one pass.
- **Non-TTY never hangs.** No human on deck means an error that names the flag, exit 2, with
  a fix a machine can apply and retry.
- **`--interactive`** asks for every missing required option in one pass; **`--yes`** accepts
  every confirmation; cancellation exits `CANCELLED` and restores the terminal.
- **Accessible mode** falls back to line input with no live redraw.
- **Drop-in paths** for inquirer and clack, graded by their own suites.

Part of the [burgee](https://github.com/ofri-peretz/burgee) family: a CLI on burgee declares
what it is, roundel carries its colours, flagstaff flies it, caique answers back. Each is
an independent package; none requires the others.
