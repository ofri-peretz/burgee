---
id: D-20261027-caique-pty-windows-conpty
subject: 'caique criterion 3: is there a dependency-free real-terminal route on Windows, or is "macOS, Linux and Windows" restated?'
taken: 'There is one: ConPTY through Python''s ctypes. The criterion is not restated. Decided under the owner''s delegation of trade-offs.'
date: '2026-10-27'
superseded_by: —
---

**Windows gets a real terminal without a dependency: a pseudo-console (`CreatePseudoConsole`,
kernel32, Windows 10 1809 and later) opened through Python's `ctypes`.** Python is preinstalled on
every GitHub-hosted runner, as it is for the POSIX route, and `ctypes` is its standard library, so
nothing enters the lockfile (U1). `scripts/pty-host.py` holds both routes behind one interface —
`pty.fork()` on POSIX, ConPTY on Windows — and `packages/caique/src/pty-cancel.test.ts` runs on all
three OSes of `compat.yml`'s matrix. caique's criterion 3 keeps its wording.

**Why this was a question.** `packages/burgee/src/pty-signal.test.ts` records that "a Windows
pseudo-console means ConPTY in kernel32, reachable only from a native addon", and so skips
Windows; the 2026-10-26 sweep said that if Windows had no dependency-free route, the criterion
would need restating. A native addon is one way to call kernel32. `ctypes` is another, and it is
already on the runner.

**The options.**

| | node-pty (devDependency) | ConPTY through `ctypes` (taken) | restate to two OSes |
| :-- | :-- | :-- | :-- |
| Dependency | a native addon in the root lockfile, prebuilds per platform, loaded with `--ignore-scripts` | none | none |
| Windows covered | yes | yes | no |
| What it costs | a supply-chain entry the scanners and Scorecard then hold us to | about 120 lines of Python, written once, beside the POSIX route | the criterion |

**How a Windows console differs, and why the test still means the same thing.** A console in raw
mode (`ENABLE_PROCESSED_INPUT` off, which Node's `setRawMode(true)` sets) delivers Ctrl+C as the
byte `0x03`, as a POSIX terminal with `ISIG` off does. With processed input back on, it raises
CTRL_C_EVENT and the process ends with `STATUS_CONTROL_C_EXIT` (0xC000013A). So the test's proof —
the second Ctrl+C ends the process only if the first prompt gave the terminal back — reads the
same on all three OSes. The child is started with `STARTF_USESTDHANDLES` and null handles, as
node-pty's own ConPTY agent does, so it takes the pseudo-console's handles rather than the
harness's redirected pipes.

**Not changed:** `pty-signal.test.ts` stays POSIX-only. Its subject is a signal delivered by the
tty line discipline to a process in cooked mode; a console has no signals, only control events,
and that is a different test.
