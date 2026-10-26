---
'burgee': patch
---

`burgee migrate` no longer tells a blocked run it rewrote anything. When a preflight row blocks the write, the file list is headed `would rewrite, not rewritten (blocked):` instead of `rewrote:`, and there is no `next: npm install … && npm uninstall …` line (`next` is `""` in `--json`), since nothing moved. After a rewrite to `burgee/commander/v14` or `burgee/yargs/v17`, the grade printed beside it is that major's own suite's (`commander 14  1331 / 1331`, `yargs 17  793 / 794`), not the current major's, and the `--json` row carries `major`.
