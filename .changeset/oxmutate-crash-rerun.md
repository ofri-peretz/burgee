---
"oxmutate": minor
---

A mutant whose worker went down is run once more, alone in a fresh worker with no sibling, before it
is a RuntimeError. The crash may be a neighbour's: a mutant that allocates until the kernel kills a
worker takes down whichever one is biggest, and the mutant it was running got the blame (pathe at 10
and 13 workers: `_glob.ts:49:11` RuntimeError where a fresh worker says Killed). The lone run's verdict
stands, a crash included, so a mutant that really takes its worker down stays a RuntimeError. A warm
crash goes straight to its own isolated unit; a crash in an isolated unit or a confirmation is run
again in the same pool. New cause `crashed` in `isolatedByCause` and in the summary line. Also: the
re-runs of the 3x stages now count in `isolatedRuns`, so every isolated run has a cause again.
