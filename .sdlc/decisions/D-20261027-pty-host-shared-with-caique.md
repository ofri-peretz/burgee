---
id: D-20261027-pty-host-shared-with-caique
subject: 'Two batches need a real terminal in a test at once — caique''s Ctrl+C (batch 51, feat/caique-flagstaff-close) and controlroom''s restore matrix. Where does the pseudo-terminal helper live, and who owns it?'
taken: 'Taken by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-27, in feat/controlroom-close'
date: '2026-10-27'
superseded_by: —
---

**One helper, `scripts/pty-host.py`, byte-identical in both branches: this branch carries the
file batch 51 wrote (`git hash-object` be11d1cc…), unmodified. Whichever merges first adds it; the
second merges a file that already exists with the same contents, which git resolves without a
conflict. A change to it after both land is one change, in one place.**

Python's standard library, so nothing enters a lockfile (U1): `pty.fork()` on POSIX — the route
`packages/burgee/src/pty-signal.test.ts` measured and chose over `script(1)` and `zsh/zpty` — and
ConPTY through `ctypes` on Windows. It runs a program on a terminal, relays the test's stdin as
typing, and reports `SIGNAL <n> CODE <m>`.

**What controlroom uses it for.** `packages/closeout/src/pty-matrix.test.ts`, the restore matrix
of criterion 4, and the real-terminal case in `examples/dashboard/dashboard.test.mjs`. Both read
the line discipline through `stty -a` during the exit, before Node's own `ResetStdio` puts the
terminal back, so a raw mode closeout never released is seen rather than masked. Both are POSIX
only: Windows' pseudo-console re-renders what a program writes, so the bytes it relays are the
console's and not the program's, and Windows has neither `stty` nor real signals.
