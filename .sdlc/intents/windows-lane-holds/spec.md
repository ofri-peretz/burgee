# Design — the Windows cells pass on a saturated runner

Intent: [`intent.md`](./intent.md). **Status:** review.

---

## Requirements

- **R1 — Durations from the cell.** `compat.yml`'s `matrix` and `floor` steps run vitest with the
  `json` reporter beside the default, and upload the files as an artifact on every OS; and its
  `workflow_dispatch` takes `os` and `node` inputs that select one cell (for R3's measurement). *Check:*
  `npm run lint:workflows` rule: both jobs upload a durations artifact; red on main.
- **R2 — A half-budget check.** `scripts/slow-cases.mts <report.json…>` lists every case whose
  duration exceeds half its effective timeout, and exits 1 when any does. *Check:*
  `scripts/slow-cases.test.ts` (new) over a fixture report with one case at 61 of 120 s; red on
  main, no script. Run against the first Windows report after R1, it must name the cases this
  intent fixes, or the intent's evidence is wrong and R3–R5 are re-scoped from what it names.
- **R3 — `pwsh` cannot hang the case.** One process per case is already on `main` (#1085);
  what is left is an intermittent hang. The call in `completions.test.ts` takes, in the owner's
  order of likelihood: `stdio: ['ignore', 'pipe', 'pipe']` and `-NonInteractive` (stdin left as a
  pipe); `POWERSHELL_UPDATECHECK=Off` and `POWERSHELL_TELEMETRY_OPTOUT=1` in its env (first-run
  checks); and an `execFileSync` `timeout` of 60 s, under the case's 120 s, so a hang fails with
  pwsh's own stderr instead of vitest's generic timeout. Which of the three is the cause is
  *unknown* (`?`), so all three land together and the stderr from any later failure names the next
  one. *Check:* a case in the same file asserts the call's options (red on main: none of them is
  set); and the hang rate, measured as below.
  - **The hang rate, measured, not one green run.** Dispatch the Windows cell about ten times on
    the unfixed test and ten on the fixed one, and record the hang count for each in this spec.
    Baseline evidence: 2 hangs (#1092, #1094) against at least one clean run (#1077) on
    2026-10-12/13. The fix holds at 0 of 10. So that twenty dispatches do not cost twenty full
    13-job matrices on a queue already at about six jobs, R1's workflow edit gives
    `compat.yml`'s `workflow_dispatch` an `os` and `node` input that selects one cell.
- **R4 — `changeset-check-lock` builds its repository once per file.** A `beforeAll` builds the
  base repository; each case clones it (`git clone --local --no-hardlinks` into a temp directory)
  instead of `git init` and committing. *Check:* the R2 report; and a case counting `git` spawns
  per case through a wrapper, at most three, red on main.
- **R5 — One `npm` install per file.** Install-running files install once in `beforeAll` with
  `--prefer-offline --no-audit --no-fund` and share the tree across cases. *Check:* the R2
  report; and `scripts/spawn-budget-lock.test.ts` (new) scanning `scripts/*.test.ts` for
  `npm install` or `npm ci` inside an `it(` body, red on main if any is found there today.

## Design

Measure on the cell first (R1, R2), because the only Windows evidence on hand is from run logs
and commit messages. Then fix by spawn count, file by file, each a PR in the test-file group.

Order: R3 first, because the hang is on `main` now and fails unrelated PRs (#1092, #1094), and it
touches no workflow. Then R1 and R2 (workflow, after `ci-affected-lanes`' workflow PR), then R4
and R5 in any order.

## Verification

| R | Check | Red on main |
| :-- | :-- | :-- |
| R1 | `lint:workflows` rule | no artifact |
| R2 | `scripts/slow-cases.test.ts` | no script |
| R3 | the options case in `completions.test.ts`; hangs in 10 dispatches, unfixed against fixed | no option set; 2 known hangs |
| R4, R5 | R2 over a Windows report; `spawn-budget-lock.test.ts`; the git-spawn count | over half budget? |

No state machine; no model. R5's "red on main" is `?`: whether any install runs inside an `it`
body today is read by the lock the day it is written.

## Rejected alternatives

- **Raise the timeouts, or skip on Windows.** Refused by D-20261012-windows-lane-fix-the-case.
- **Larger Windows runners.** A paid outward change the owner has not taken.
- **Retry on timeout.** "Flake" is not a root cause; a retry hides the same cost every run.

## Out of scope

- macOS cells, which run at concurrency two and are not named in the evidence.
