---
id: D-20261027-caique-conpty-line-proof
subject: 'caique criterion 3 on Windows: the second Ctrl+C under ConPTY passes in some runs and fails in others. Is raw mode left on, or is the proof unreliable?'
taken: 'The proof is unreliable, not the restore. On Windows, raw mode is graded by a line read back through the terminal; the second Ctrl+C is reported there and graded on POSIX only. Decided under the owner''s delegation of trade-offs.'
date: '2026-10-27'
superseded_by: —
---

**The terminal is restored; the proof was unreliable.** `packages/caique/src/pty-cancel.test.ts`
proved the restore on Windows by pressing Ctrl+C a second time after the prompt and expecting the
process to end of CTRL_C_EVENT. It passed on main's probe cell (run 40597587808, Node 24.22.1,
`windows-2025-vs2026` 20261021.278.1). It failed on #1324's cell (job 122536871640), on the same
image and the same Node. There, both fixtures outlived the second press after printing
`outcome=refused CANCELLED` and `raw=false`.

**Why this is not a restore race.**

- **Two restore paths failed together.** The `promptFor` fixture restores through `node:readline`'s
  `close()`. The clack fixture restores through `closeout/cursor`'s `rawMode()` undo. They share
  no code below Node, and both failed in the same run and passed in the other. A race in either
  restore order would fail one fixture at a time.
- **Node 20.19 and 22.13 never deliver the event.** On #1316's cells the same fixtures, with
  `raw=false`, outlived the second press on every run on those two runtimes. Delivery of
  CTRL_C_EVENT through a pseudo-console depends on the run and the runtime, so it is not a reading
  of the console's mode.
- **The terminal's mode, read directly, is cooked.** The test now types `ok` and Return at the
  terminal after the prompt, and the fixture reads it back. A cooked terminal hands over the whole
  line ended by a newline: `ok\n` on POSIX through ICRNL, `ok\r\n` from a Windows console in line
  mode. A raw terminal hands over the keys as typed, with Return as a bare `\r`. This is the
  terminal's own behaviour, and the same on every OS and runtime.

**Proven to fail on the broken code.** With `clack-core.ts`'s `release()` not calling `unraw()`,
the clack fixture reads `"ok\r"` back. The case fails on that alone, with the `raw=false` check
taken out to isolate it: "read "ok\r": the terminal was left raw".

**What the test grades now.**

| | POSIX | Windows |
| :-- | :-- | :-- |
| the question is cancelled | graded | graded |
| `raw=false` (Node's record) | graded | graded |
| a line read back ends in a newline (the terminal's mode) | graded | graded |
| the second Ctrl+C ends the process | graded: SIGINT, signal 2 or exit 130 | reported, not graded |

The Node < 24 carve-out (`secondPressProves`) is gone. The line proof holds on every runtime, so
the Windows cells on Node 20.19 and 22.13 now grade the restore too.

**Considered and rejected.** Waiting for a further signal before the second press. The press is
already sent after the fixture has printed `raw=false`, which follows `setRawMode(false)`. It is
also sent after `waiting`, which follows a line the console had to deliver in line mode. On a
console that is provably cooked by then, the event still went undelivered, so no earlier wait
would make it arrive. Retrying the press would only turn a missing proof into a passing one.

The `interrupt.qnt` model is unchanged. Its `restoredAtTheEnd` and `rawOnlyWhileAsking` describe
the restore, and the restore is what this run confirms.
