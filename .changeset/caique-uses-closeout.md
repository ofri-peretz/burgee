---
'caique': patch
---

Restore the cursor when a prompt is killed, by taking the job from `closeout`.

`raw.ts` hid the cursor and put it back on one path: the keypress loop, which sees Ctrl-C
because raw mode delivers it as a byte rather than a signal. A `SIGINT` from a parent
process, a `SIGTERM`, a crash or a `process.exit()` elsewhere in the program never reached
that loop, and left the cursor invisible in the user's shell until they typed `reset`.
Measured against the built `dist/raw.js`: hide 1, show 0, for `SIGINT`, `SIGTERM` and
`SIGHUP` alike.

`askList()` now hides through `closeout.hideCursor()`, which registers the restore in the
same call, with `closeout/exit-hook` running it on the paths a keypress loop cannot see.
The two escape sequences come from `closeout/cursor` as well, so caique no longer carries
the family's third copy of them. The bytes on the wire are unchanged for a prompt that
ends normally, and a prompt that ended unregisters, so exit writes nothing twice.

caique therefore installs one package, `closeout`, which this repository publishes and
which sits in the foundation tier below it. Nothing outside this repository is installed.
