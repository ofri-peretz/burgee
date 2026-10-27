# Intent — the Windows cells pass on a saturated runner

> Stage 1 artifact. Opened from the wave-4 ranking
> ([`next-wave-4-2026-10.md`](../../research/next-wave-4-2026-10.md)). The same three cases time
> out on `windows-latest` and pass on Linux. Refreshed 2026-10-18 with per-case durations read
> from `main`'s own Windows cells.

**Status:** approved · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

---

## What is wanted

No case in a Windows cell uses more than half of its timeout, measured on the cell itself. The
three recurring offenders are rewritten to spawn fewer cold processes, or to spawn them where the
runner is not saturated, with every assertion kept. They are PowerShell completions,
`changeset-check-lock`, and the cases that run `npm install`.

## Why now

- **PowerShell completions: a load-bound slowdown whose tail reaches the timeout.** #1085
  merged (`0b63425`) and asks every line of one `pwsh`. Yet `completions.test.ts` ›
  *PowerShell: subcommands, options and choice values with tooltips* still hit its 120,000 ms
  timeout on Node 26 · windows-latest in #1094 (job 115091657590, 122,208 ms) and in #1092
  (the owner's evidence on #1090, 2026-10-13). The 2026-10-18 durations of that case on
  `main`'s pushes (compat runs 39149980298 through 39163516235) show why:

  | cells | n | case duration |
  | :-- | --: | :-- |
  | `Node 24/26 · windows-latest` (the full matrix, turbo at two tasks) | 15 | 13.7–59.7 s, median 22.0 s; 3 of 15 above 50 s (54.2, 58.8, 59.7) |
  | `Node 20.19/22.13 · windows-latest · published suites` (lighter load) | 22 | 0.9–2.3 s |

  The OS, image, `pwsh` and script are the same; only the load differs, and the case is 10–30×
  slower under it. The 120 s failures are the tail of the full-cell distribution, not a separate
  intermittent hang. The case already spends half its budget on a normal day (59,682 ms, run
  39161241576, job 117775104284).
- **The call on `main`** (line 123) is
  `execFileSync('pwsh', ['-NoProfile', '-File', …], { encoding: 'utf8' })`. stdin is left as a
  pipe, there is no `-NonInteractive`, no `timeout`, and pwsh's first-run update and telemetry
  checks are on.
- **The matrix comment.** `compat.yml`: at turbo's default concurrency, Windows' Node 26 cell
  failed 2 of 10 runs on timing alone, each time a different test (vendor-run, ink-alias,
  completions). Concurrency was cut to two there. On 2026-10-18 the one `main` Windows failure
  was `scripts/ink-alias-lock.test.ts` (run 39145167328), which is the same family.
- **`changeset-check-lock`.** Its describe block carries a 120 s timeout
  (`scripts/changeset-check-lock.test.ts` line 180) and builds a git repository, with commits,
  per case.
- **Install cases.** Ten root-suite files spawn `npm` (`independence-install-lock`,
  `pack-list-lock`, `package-shape-lock` and seven more).
- **Decided.** D-20261012-windows-lane-fix-the-case: make the case cheaper; never raise a
  timeout or skip on Windows.

## Affected users and systems

- `scripts/complete-pwsh.ps1` and the `pwsh` call in `packages/burgee/src/completions.test.ts`.
- `scripts/changeset-check-lock.test.ts`, and the root-suite files that spawn `npm`.
- A timing reporter for the compat `matrix` cells, and `compat.yml`'s `workflow_dispatch`.

## Constraints

- **Every assertion stays.** A rewrite that drops one is a skip under another name.
- **No timeout rises.** The 30 s rule in `vitest-timeouts.config.ts` stands. An inner
  `execFileSync` timeout below the case's own is allowed, because it lowers nothing a reader
  trusts and only names the failure.
- **One PR at a time in `.github/workflows/`.** Shared with `ci-affected-lanes`, whose workflow
  PR (#1101) has merged.
- **`fix-lines-every-shell` R3 adds a `pwsh` case on the same cells.** It must ride the same
  mechanism R3 lands here, or follow it.

## Success criteria

1. A per-case duration report from every Windows cell, uploaded as an artifact.
2. A check over that report names any case above half its timeout. It names none.
3. Ten consecutive green Windows cells on `main`.
4. The PowerShell case at or under 60 s in every one of ten consecutive full Windows cells on
   `main`, with a median under 10 s. Baseline: median 22.0 s, maximum 59.7 s, n = 15.

## Where the criteria stand — 2026-10-26

**Status stays `approved`: criteria 1, 3 and 4 are met on `main`'s own Windows cells; criterion
2 is not.** Read from every full Windows cell (`Node 24/26 · windows-latest`) that `main`'s
pushes completed from #1135 (2026-10-19 06:38 UTC) to 2026-10-26 05:27 UTC: 71 cells in 53
compat runs, each one's `vitest-durations-matrix-windows-latest-node*` artifact downloaded and
read. R1–R5 merged in #1135.

| # | criterion | state | evidence |
| :-- | :-- | :-- | :-- |
| 1 | a per-case duration report from every Windows cell, as an artifact | met | every one of the 71 cells uploaded one (e.g. run 40273043615, artifact 12629951273: 12,007 cases), and so does every floor cell |
| 2 | the half-budget check names no case | **not met** | it named a case in 5 of the 71 cells; see below |
| 3 | ten consecutive green Windows cells on `main` | met | 13 consecutive full cells, 2026-10-20 03:10 to 17:49 UTC (runs 39362061065 to 39468510809), with every floor Windows cell between them green (32; 18 more cancelled by a newer push). The table is in the spec |
| 4 | the PowerShell case at or under 60 s in each of ten consecutive full cells, median under 10 s | met | 2.9–6.3 s over those ten, median 4.7 s; 2.1–6.7 s, median 4.4 s, over all 68 cells that ran it (baseline: median 22.0 s, maximum 59.7 s) |

**Criterion 4 is met by the case it names, and the cost moved rather than vanished.** One pwsh
now answers that case (#1085), but the first pwsh a cell starts is in *R3 — the PowerShell script
reports its phases on stderr*, and it took 7.5–68.6 s, median 15.8 s. R3a's phase lines say where:
`lookup` took 52.3 s of 54.7 (run 40178182310), 60.4 s of 62.4 (run 40261602993) and 65.3 s of
68.6 (run 39441261818), and every later phase took milliseconds. That is R3d's condition, so R3d
is built in this change: the `lookup` phase calls .NET instead of `Get-Command`, `Join-Path`,
`New-Item`, `Set-Content` and `Select-Object` (`scripts/complete-pwsh-lock.test.ts`, red on
`main`). Whether module discovery was the cost is what the next cells' `lookup` lines say.

**Criterion 2, the cases it named:**

| run | case | duration of timeout |
| :-- | :-- | :-- |
| 39212607045 (Node 26, a failed cell) | `scripts/family-versions.test.ts` › "… cutting each body by bytes …" | 15,373 of 30,000 ms |
| 39238336591 | `scripts/changeset-check-lock.test.ts` › "… answers `release` for the branch changesets pushes …" and › "… still answers `skipped` for the label …" | 17,287 and 18,087 of 30,000 ms |
| 39441261818 | `completions-shells.test.ts` › "R3 — the PowerShell script reports its phases on stderr"; `packages/controlroom/src/shape.test.ts` › "runs an Ink program once react and react-reconciler are installed" | 68,555 and 72,730 of 120,000 ms |
| 40261602993 | `completions-shells.test.ts` › "R3 — the PowerShell script reports its phases on stderr" | 62,401 of 120,000 ms |
| 40268928470 | `scripts/changeset-check-lock.test.ts` › "… answers `release` …" | 20,873 of 30,000 ms |
| 40537347822 (2026-10-27, a failed cell) | `scripts/changeset-check-lock.test.ts` › "… answers `release` …" | 65,871 of 30,000 ms |

**What closes it:** the check naming no case in each of ten consecutive full Windows cells on
`main`, counted from the merge of R6 and R7, the window criteria 3 and 4 already use. R3d answers
the pwsh row. R6 answers `changeset-check-lock`: R4 had already moved the git build out of the
cases, and what was left was the first `bash` the file started from Node (3.2–8.5 s over ten
full cells, then 65.9 s in run 40537347822, which timed out). R6 starts that `bash` once per file,
in `beforeAll`, and the cases spawn nothing. R7 answers controlroom's Ink case: 11.2–27.0 s of
120 s over the same ten cells, so under half, but 72.7 s once. Its three peer `npm pack`s become
one. Both are in [D-20261027-windows-lane-one-shell-per-file](../../decisions/D-20261027-windows-lane-one-shell-per-file.md),
with what R6 moves into a hook that the check does not time. On 2026-10-19 `main` completed 31
full Windows cells in a day, and on 2026-10-25 eleven, so the reading is one to two days of
pushes.

## Jev triage

| user_impact | incumbent_gap | risk_reduced | composite | ready_for_spec | needs_model |
| --: | --: | --: | --: | :-- | :-- |
| 0 | 0 | 3 | 6 | yes | no |

## Open questions

- Whether to raise timeouts or skip on Windows. **Decided 2026-10-12**,
  D-20261012-windows-lane-fix-the-case: neither.
- Whether the owner's three candidates are the cause. **Answered 2026-10-18 in `spec.md`**:
  probably not the main one. The same call runs in about 2 s on the lighter Windows cells, so
  the cause must scale with load. All three still land, because they are cheap. R3 adds phase
  timing and isolation from the contended pool.
