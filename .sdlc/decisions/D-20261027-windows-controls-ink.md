---
id: D-20261027-windows-controls-ink
subject: 'The Windows cell runs out its 30 minutes in Controls: which host, and what bounds it?'
taken: 'ink is not graded on win32, and says so on every run there; Controls gets its own 17-minute limit and names each host as it starts'
date: '2026-10-27'
superseded_by: —
---

**ink's control is not graded on Windows. Every run there prints it under the report with the
reason. The Controls step gets its own `timeout-minutes: 17` under the job's 30. `--progress`
names each host as its grade starts and ends.** The Windows cell runs ink's suite into its cap
twice per grade, and repeat-and-agree grades it three times. That is an hour, inside a 30-minute
job.

**What the bad runs showed.** Since about 13:00 UTC on 2026-10-27, `Node 24 · windows-latest`
was cancelled at its 30-minute limit on most runs. Examples: main run 40563285190 (job
122398898870), and 40562160983, 40560816628 and 40554842777. In each one, "Our suite" passed. Then
Controls printed npm's install warnings and went silent for 11 to 16 minutes, until the cancel.
The last warning before the silence is always the `node-pty@1.2.0-beta.15` install-scripts line.
`node-pty` is in one host's `suiteDeps` only: ink's. `inkjs-ui`, graded next, installs `tsx` and
so prints the `esbuild` line. That line never appears.

**Why it started at 13:00: the green runs never graded a control.** In runs 40501637412,
40497725559 and 40435485792, Controls ended after 7 to 8 seconds with
`Error: spawnSync npm ENOENT` in `installSuiteDeps`, on `extra-typings`, the second host.
`npm` is `npm.cmd` on Windows. #1298 (merged 13:07Z) moved the oracle's spawns to
`bellpull/cross-spawn`, which resolves the `.cmd`. So from #1298 on, Windows Controls got past
the second host for the first time, and reached ink. #1298 has no defect here; it fixed the
spawn that hid ink. The re-vendor #1285 did not move ink.

**What the measurement showed.** The measurement is run 40577331465, a `workflow_dispatch` of
the Windows cell on a throwaway branch with `--progress` and `COMPAT_TAP_DIR`.

| host | grade 1 | grade 2 | grade 3 |
| :-- | --: | --: | --: |
| ink | 1,208 s | 1,200 s | 1,200 s |
| every other host, first pass | 7.3 min | | |
| every other host, regrades | 5.4 min | | |

Each ink grade is two runs of ink's 600 s `suiteTimeoutMs`, the gated files and the
informational ones, and both hit the cap. The kept TAP says where they stop:

- **Gated run.** It reports 248 cases, with 26.8 s of summed case time, through
  `components.tsx`. That is the first file that opens a pseudo-terminal through node-pty, and
  its four PTY cases pass. No later file reports anything.
- **Internals run.** It reports 128 cases through `issue-973-static-commit.tsx`, the first
  internal file that opens a PTY. Again, nothing after it reports.

Under `--test-concurrency=1` the next file starts only when the previous one's process exits.
So on Windows, the first node-pty file's process does not exit. Upstream does not run this suite
on Windows: ink's `.github/workflows/test.yml` at v8.0.0 is `ubuntu-latest` only.

**So a skip, for ink's own reason, as #1303 skipped twist.** `Host.notGradedOn` takes the
platforms and the reason. `main()` vendors the host but does not grade it there. Every run there
prints `not graded on win32: ink — <why>`. Darwin and Linux grade ink exactly as before. The
ratchet and its baseline are Linux, so they are unchanged. `report.test.ts` holds ink as the
only declared host and holds the output line. The case fails with the declaration removed.

**Defence in depth.**

- `timeout-minutes: 17` on the Controls step. Without ink, Windows Controls measured about
  13.5 min. The steps before it take about 9, so the job keeps about 4 minutes, and an
  informational step cannot take the hard gate's budget again.
- `--progress` on the matrix Controls step. The report prints only once every host is graded,
  which is why the bad runs were silent. The ratchet's steps do not pass the flag, so the
  scoreboard summary is unchanged.

**Rejected.**

- **Raising ink's `suiteTimeoutMs`, or the job's limit.** The run does not finish slowly. It
  stops after the first PTY file. More time buys nothing.
- **Killing the process tree on timeout.** Node's `spawnSync` already kills the child and closes
  our end of its pipes on timeout: every ink run above returned at 600 s. Neither bellpull nor the
  call site lost a timeout.
- **Not regrading a timed-out row.** It would cut ink's hour to 20 minutes, but it changes R7 for
  every row on every platform. On Windows the regrades of the other hosts cost 5.4 min, because
  controls that fail every time are graded three times. That is recorded here as the next cost
  to look at, not changed in this decision.
