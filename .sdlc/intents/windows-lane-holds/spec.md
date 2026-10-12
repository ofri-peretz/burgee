# Design — the Windows cells pass on a saturated runner

Intent: [`intent.md`](./intent.md). **Status:** review.

---

## Requirements

- **R1 — Durations from the cell.** `compat.yml`'s `matrix` and `floor` steps run vitest with the
  `json` reporter beside the default, and upload the files as an artifact on every OS. *Check:*
  `npm run lint:workflows` rule: both jobs upload a durations artifact; red on main.
- **R2 — A half-budget check.** `scripts/slow-cases.mts <report.json…>` lists every case whose
  duration exceeds half its effective timeout, and exits 1 when any does. *Check:*
  `scripts/slow-cases.test.ts` (new) over a fixture report with one case at 61 of 120 s; red on
  main, no script. Run against the first Windows report after R1, it must name the cases this
  intent fixes, or the intent's evidence is wrong and R3–R5 are re-scoped from what it names.
- **R3 — PowerShell completions in one process.** Landed by #1085 if it merges; otherwise the
  same design here. *Check:* the case's duration in the R2 report under half its timeout.
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

Order: R1 and R2 (workflow, after `ci-affected-lanes`' workflow PR), then R3–R5 in any order.

## Verification

| R | Check | Red on main |
| :-- | :-- | :-- |
| R1 | `lint:workflows` rule | no artifact |
| R2 | `scripts/slow-cases.test.ts` | no script |
| R3–R5 | R2 over a Windows report; `spawn-budget-lock.test.ts`; the git-spawn count | over half budget? |

No state machine; no model. R5's "red on main" is `?`: whether any install runs inside an `it`
body today is read by the lock the day it is written.

## Rejected alternatives

- **Raise the timeouts, or skip on Windows.** Refused by D-20261012-windows-lane-fix-the-case.
- **Larger Windows runners.** A paid outward change the owner has not taken.
- **Retry on timeout.** "Flake" is not a root cause; a retry hides the same cost every run.

## Out of scope

- macOS cells, which run at concurrency two and are not named in the evidence.
