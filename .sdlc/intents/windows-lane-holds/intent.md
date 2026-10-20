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
