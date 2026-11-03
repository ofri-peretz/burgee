---
id: A-20261101-oxmutate-disk-pollution-restart
section: A
status: open
source: 'batch 71 (fix/oxmutate-pollution-false-positives), 2026-11-01: compat-oracle mutant 34daef7c85fa6758 in src/run.ts `linksInternal`, before #1419'
done_when: 'a mutant that leaves state on disk which fails the unmutated tests is detected as such, its context is not restarted against the same broken file, and the mutants after it are not decided against it; a fixture that writes through a symlink into node_modules proves it, red on the code before'
---

oxmutate assumes that a restarted context is clean. When the per-execution canary fails, the
coordinator re-queues the rest of the unit into a fresh context (`afterUnit` in `coordinator.ts`).
That only resets state held in memory. Pollution a mutant writes to **disk** survives it.

The repro: compat-oracle mutant 34daef7c85fa6758 in `src/run.ts` `linksInternal`, before #1419. The
mutant wrote through a symlink into `node_modules`. Every fresh context then read the broken file,
so its canary failed again, and the unit restarted again, down to the depth limit of 40. The
mutants left at that point went to the isolated queue. Meanwhile, later verdicts in those contexts
were decided against the broken file.

compat-oracle's tests no longer do this (#1419, #1422), so the weekly run is not exposed today. The
engine still is, for any suite whose test can be made to write outside a temp directory.

**To close.** Detect it in the coordinator. One option: a canary that fails again in a context
that has run no mutant is pollution the restart cannot clear, so stop restarting and report it.
Name the mutant that left it and the path, and send the rest of the unit to isolated runs instead
of another restart. Prove it on a fixture that writes through a symlink into `node_modules`, red on
the code before.
