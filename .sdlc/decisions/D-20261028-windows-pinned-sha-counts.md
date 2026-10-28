---
id: D-20261028-windows-pinned-sha-counts
subject: 'windows-lane-holds criterion 2 asks for ten consecutive full Windows cells on `main` whose half-budget check names no case. Do ten dispatched runs of `compat.yml`, each pinned to one `main` commit, count?'
taken: 'Taken by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-28'
date: '2026-10-28'
superseded_by: —
---

**Yes. Ten `compat.yml` runs dispatched one after another with `os=windows-latest` and `node=24`
count as "ten consecutive full Windows cells on `main`" when every one checks out the same `main`
commit, runs the full suite, and none is skipped or retried.** The ten ran on the branch
`probe/windows-lane-holds`, which points at `b62cf2a105`, the merge of #1322 on `main`. That commit
holds R6 and R7 (#1314, #1319), so all ten fall inside the window the intent counts from. Every
run concluded `success` on its first attempt, every cell ran with `FULL: true`, and every cell's
*Cases above half their timeout* step printed `0 of 12207 case(s) above half their timeout`.

| # | run | Windows job | started (UTC) | job time | half-budget check | highest share of any case |
| --: | :-- | :-- | :-- | --: | :-- | :-- |
| 1 | 40597587808 | 122517492175 | 10-27 22:48 | 27 m 22 s | 0 of 12,207 | 24.9 % |
| 2 | 40601063647 | 122529444476 | 10-27 23:18 | 26 m 15 s | 0 of 12,207 | 26.9 % |
| 3 | 40604239095 | 122540076795 | 10-27 23:46 | 26 m 03 s | 0 of 12,207 | 27.8 % |
| 4 | 40607319302 | 122550602693 | 10-28 00:14 | 24 m 37 s | 0 of 12,207 | 21.1 % |
| 5 | 40610173806 | 122560871013 | 10-28 00:43 | 22 m 06 s | 0 of 12,207 | 25.0 % |
| 6 | 40613018097 | 122571697675 | 10-28 01:16 | 26 m 55 s | 0 of 12,207 | 32.1 % |
| 7 | 40616755385 | 122584760526 | 10-28 01:57 | 23 m 32 s | 0 of 12,207 | 16.5 % |
| 8 | 40654350691 | 122701963614 | 10-28 08:06 | 24 m 34 s | 0 of 12,207 | 23.3 % |
| 9 | 40657396111 | 122711829188 | 10-28 08:31 | 28 m 28 s | 0 of 12,207 | 28.2 % |
| 10 | 40662232727 | 122727990005 | 10-28 09:11 | 17 m 35 s | 0 of 12,207 | 13.1 % |

The check line was read from each job's log. The highest share was read from each cell's
`vitest-durations-matrix-windows-latest-node24` artifact. It was
`scripts/plan-progress-lock.test.ts` in seven cells (at most 96.2 s of 300 s), roundel's
`supports-color` agreement case in two, and compat-oracle's `bands.test.ts` in one. None is a case
the intent names.

The cases the intent names, over all ten cells:

- The PowerShell completion case took 0.56–1.14 s, median 0.81 s (baseline: median 22.0 s, maximum
  59.7 s).
- The R3 phases case took 0.95–1.71 s.
- controlroom's Ink case reached 15.4 % of its budget (18.4 s of 120 s).
- Every `changeset-check-lock` and `dependabot-automerge-lock` case took 3 ms or less.

Those two files' work now runs in `beforeAll`, which the check does not time
(D-20261027-windows-lane-one-shell-per-file). The two whole files took 2.4–23.0 s and 2.2–5.3 s,
under that hook's 120 s.

There was a gap between run 6 and run 7, from 01:43 to 08:05 UTC. The loop that dispatched the runs
waited out a network outage and then went on. No run was started and dropped, and none was re-run,
so the ten are still consecutive: every dispatch in the series is in the table.

**Why a pinned dispatch is a cell on `main`.** The criterion measures `main`'s code on the Windows
runner. A dispatched cell runs `main`'s commit, with `main`'s `compat.yml`, in the same job on the
same image. The `os` and `node` inputs that R1 added exist to select that one cell, and the spec
names this dispatch as the fallback. Pinning also removes one variable that push cells cannot
remove: on push cells, `main` moves between the cells. A streak spread over ten pushes measures ten
different trees, and a newer push cancels many of the cells. From #1322's own push to `cf4a78cc56`,
9 of `main`'s 14 compat push runs were cancelled. Ten cells of one tree are a cleaner reading of the claim, not a weaker
one.

**What `main` took after the pin.** Only one later commit changes how a Windows cell grades a case:
c2c42450 (#1327). It changes one caique test, `pty-cancel.test.ts`. On Windows, that test now grades
the restore by a line read back, and it reports the second Ctrl+C instead of grading it
(D-20261027-caique-conpty-line-proof). Before that commit, the old grading passed in all ten
dispatched cells. It failed once on a PR's Windows cell (#1324, job 122536871640). That failure was
in ConPTY's delivery of the event. It was not a timeout, and it was not on `main`.

The other later commits are not Windows-specific:

- #1325 changed burgee's `serve --mcp` and its yargs factory.
- #1329 bumped dependencies.
- The rest are a Scorecard action pin, weight numbers, a waiver, docs and a release.

`main`'s own push cells after #1322 agree with the dispatched ten. Six full Windows cells
completed, and all six were green:

| run | commit | half-budget check |
| :-- | :-- | :-- |
| 40597994108 | `f7fc484ed9` | 0 of 12,207 |
| 40601766641 | `b1d87da8b3` | 0 of 12,207 |
| 40605019755 | `9016a321a7` | 0 of 12,207 |
| 40613933941 | `b01a2295ac`, after c2c42450 | 0 of 12,209 |
| 40620126536 | `01576fa0a8` | 0 of 12,224 |
| 40623625466 | `cf4a78cc56` | 0 of 12,224 |

The rest were cancelled by a newer push.

**What it does not change.**

- The criterion still reads a full cell that completed green. A cell cancelled at the job's
  30 minutes does not count.
- A dispatch at a commit that is not on `main` does not count.
- A series with a dropped or re-run dispatch does not count.
- One margin sits outside the criteria: the job's time. Cell 9 took 28 m 28 s of its 30. *Controls
  (informational off Linux)* took 883 s of that, under its own 17-minute limit. In every one of the
  ten cells, Controls exited 1 and was allowed to, because it is informational off Linux.

**Reversal.** compat has no schedule. It runs on pushes to `main`, on merge-queue builds, on pull
requests and by dispatch. Count the next ten full `Node 24 · windows-latest` cells that `main`
completes, or that a PR completes against it. Reopen `windows-lane-holds` if, in any of them, a case
the intent names fails, or the half-budget check names one. The named cases are:

- the PowerShell completion and R3 phases cases in `completions-shells.test.ts`;
- `changeset-check-lock`;
- `dependabot-automerge-lock`;
- `family-versions`;
- controlroom's Ink case;
- the root-suite `npm` cases.

Reopen it as well if the Windows cell is cancelled at 30 minutes twice in those ten for a reason
inside the suite.
