# Intent — the Windows cells pass on a saturated runner

> Stage 1 artifact. Opened from the wave-4 ranking
> ([`next-wave-4-2026-10.md`](../../research/next-wave-4-2026-10.md)). The same three cases time
> out on `windows-latest` and pass on Linux.

**Status:** review · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

---

## What is wanted

No case in a Windows cell uses more than half of its timeout, measured on the cell itself, and
the three recurring offenders are rewritten to spawn fewer cold processes, with every assertion
kept: PowerShell completions, `changeset-check-lock`, and the cases that run `npm install`.

## Why now

- **PowerShell completions.** A fresh `pwsh` per completion line; on a saturated runner three cold
  starts ran past the 120 s ceiling, twice on #1077 (#1085's message, open).
- **The matrix comment.** `compat.yml`: at turbo's default concurrency, Windows' Node 26 cell
  failed 2 of 10 runs on timing alone, each time a different test (vendor-run, ink-alias,
  completions); concurrency was cut to two there.
- **`changeset-check-lock`.** Its describe block carries a 120 s timeout
  (`scripts/changeset-check-lock.test.ts` line 180) and builds a git repository with commits per
  case.
- **Install cases.** Ten root-suite files spawn `npm` (`independence-install-lock`,
  `pack-list-lock`, `package-shape-lock` and seven more).
- **Decided.** D-20261012-windows-lane-fix-the-case: make the case cheaper; never raise a timeout
  or skip on Windows.

## Affected users and systems

- `scripts/complete-pwsh.ps1` and burgee's completion tests (after #1085),
  `scripts/changeset-check-lock.test.ts`, the root-suite files that spawn `npm`, and a timing
  reporter for the compat `matrix` cells.

## Constraints

- **Every assertion stays.** A rewrite that drops one is a skip under another name.
- **No timeout rises.** `vitest-timeouts.config.ts`' 30 s rule stands.
- **One PR at a time in `.github/workflows/`** (shared with `ci-affected-lanes`).

## Success criteria

1. A per-case duration report from every Windows cell, uploaded as an artifact.
2. A check over that report naming any case above half its timeout; it names none.
3. Ten consecutive green Windows cells on `main`.

## Jev triage

| user_impact | incumbent_gap | risk_reduced | composite | ready_for_spec | needs_model |
| --: | --: | --: | --: | :-- | :-- |
| 0 | 0 | 3? | 6 | yes | no |

## Open questions

- Whether to raise timeouts or skip on Windows. **Decided 2026-10-12**,
  D-20261012-windows-lane-fix-the-case: neither.
