---
id: B-20261019-yargs-17-entry-bundles-heavier
section: B
status: open
source: previous-majors R3
recommendation: 'Hold `burgee/yargs/v17` as an `OVER_INCUMBENT` ratchet in `subpath-weight-lock.test.ts`, lowered with each measurement. Bytes taken off `burgee/yargs` come off this entry too. Move the row to `DROP_IN_CEILINGS` and close this the day it bundles at or under 84,475 B'
---

`burgee/yargs/v17` bundles heavier than yargs 17.7.3's `import` entry (`index.mjs`), which is
what it replaces for an ES module program on 17. The measurement is `/docs/weight`'s
"Everything" column, against **84,475 B** for yargs 17.7.3 by the same method, measured
2026-10-19 (D-20261019-yargs-17-budget).

| | bundled | over yargs 17.7.3 |
| :-- | --: | --: |
| `burgee/yargs/v17`, 2026-10-19 | 110,312 | 25,837 |
| `burgee/yargs` (18's), for comparison | 109,147 | 24,672 |

Almost all of the overage is the 18 front-end the entry is built on. yargs 18.2.0 itself
bundles to 111,698 B by the same method, so 17's ESM bundle is the light one here. What the
v17 code adds over `burgee/yargs` is 1,165 B bundled: 17's string table, its `commandDir()`
walk and its module-cache naming (`yargs/v17-factory.ts`). The 17 → 18 growth and the bytes
burgee adds (`--json`, `--schema`, `--mcp`, the plugin check) are both shared with
`burgee/yargs`, so shrinking that front-end is the way to close this. Nothing specific to 17
would close it.

17's other CommonJS entry, `yargs/yargs`, bundles to 114,656 B, and `burgee/yargs/v17/yargs`
is under it at 110,119 B.
