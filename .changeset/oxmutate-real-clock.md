---
"oxmutate": patch
---

The watchdog now times each mutant by the real clock. Before, a test that froze the clock with `vi.useFakeTimers()` and never restored it made every later mutant in that file look as if it had been running since the freeze. The watchdog then stopped it however briefly it had run, and each stop cost a killed server and an isolated run. On a full caique run, such stops read 100 to 1,055 s "elapsed". Verdicts do not change, because a stopped mutant is decided again in an isolated run.
