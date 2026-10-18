---
id: D-20261012-windows-lane-fix-the-case
subject: 'A Windows cell times out on a case that passes on Linux: is the timeout raised, the case skipped there, or the case made cheaper?'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets and trade-offs'
date: '2026-10-12'
superseded_by: —
---

**The case is made cheaper. No timeout is raised and no case is skipped on Windows.** Each
recurring case spawns cold processes per assertion (a `pwsh` per completion line, a `git init`
and commits per changeset case, an `npm install` per install case), and on a saturated
`windows-latest` runner each cold start costs seconds. The fix is one process per file where the
assertions allow it: #1085 does it for PowerShell completions.

**Why.** `vitest-timeouts.config.ts` already set the repository's rule: a test that needs more
than thirty seconds of wall clock is a test with a bug in it, and raising a timeout to pass on a
busy machine only moves the coin toss. Skipping on Windows would remove the one cell where these
paths differ.

**Reversal.** A new decision naming a case whose cost cannot be cut, with its measurement.
