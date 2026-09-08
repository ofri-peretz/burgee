# flagstaff

**Not yet released.** This version reserves the name; the first working release follows
[`docs/intents/flagstaff/`](https://github.com/ofri-peretz/burgee/tree/main/docs/intents/flagstaff).

A **flagstaff** is the staff a flag flies from. It is the simplest part of the whole
apparatus and the only one that is always in view: a flag is hoisted on it, held there "at the
dip" or "close up", changed, and lowered when it is done. That is a terminal render loop — the
place frames are hoisted, held, changed and lowered, in view of whoever is reading.

## What it will be

- **A frame loop with a static projection.** A spinner animates on a TTY, prints one line
  per state on a pipe, emits one event under `--json`, and is plain text in accessible mode.
  A component without a static projection is refused at registration.
- **Plugins as data.** A third-party spinner, progress style or character is a plain object;
  the built-ins ship in the same shape. A plugin is a flag someone else made, flown from the
  same staff.
- **Drop-in paths** for ora, log-update, boxen and cli-table3, graded by their own suites.
- **No layout engine**, on purpose. Box, columns and a status line are the ceiling.
- **Zero external dependencies.**

Part of the [burgee](https://github.com/ofri-peretz/burgee) family: a CLI on burgee declares
what it is, roundel carries its colours, flagstaff flies it, caique answers back. Each is
an independent package; none requires the others.
