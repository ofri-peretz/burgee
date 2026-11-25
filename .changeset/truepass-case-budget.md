---
"truepass": minor
---

A per-case time budget: `truepass/vitest-reporter` fails a run when a test case takes longer than
its budget (5 s by default) and is still over it measured alone, and `truepass budget <dir>` judges
the cases a battery deferred with `TRUEPASS_BUDGET_DEFER`.
