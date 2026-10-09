---
id: A-20261009-burgee-cold-start
section: A
status: open
source: 'B2, published measurement 2026-10-08 (#893)'
done_when: 'the CI series reads burgee ÷ cac at or below 1.35 and burgee/commander ÷ commander at or below 1.10 for five consecutive runs on main, with a start-up guard that fails on the regression'
---

burgee's cold start regressed between the two published measurements on the same runner
class:
- `burgee ÷ cac`: 1.322 on 2026-09-09, 1.559 on 2026-10-08. Every CI run since 2026-10-06
  reads between 1.47 and 1.56.
- `burgee/commander ÷ commander`: 1.078 to 1.175, so the drop-in is no longer level with
  commander.
- burgee's full run over bare node: +14.0 ms to +20.3 ms.

The 1.6 ratchet still holds, and `comparison.mdx` now states the regression. A bisect and fix is
in progress on `perf/burgee-cold-start`.
