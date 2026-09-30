---
id: D-20260930-b5-ceilings-from-ci
subject: 'A B5 step set from a laptop is re-derived from the first CI run that measures it, even where that reads higher'
taken: 'Taken — the rule D-20260929-b5-runtime-ratchets already wrote beside every ratchet ("the largest CI median × 1.25"); raised for the owner to overrule'
date: '2026-09-30'
superseded_by: —
---

**Where a fix PR set a B5 ceiling from its own laptop run (1.25× local, because no CI run had measured the change yet), the first CI run that does measure it re-derives the ceiling by the rule written in `derive` — 1.25× the CI median, up to 0.05 — and that may be a step up.** It is one here: `linegauge/slice` was stepped to 0.95 from a local 0.756; CI read 0.933 (run 36728129986, the release PR on top of #763) and 0.787 (run 36738177076, #770), the first 2% under its gate. A 2% margin on a shared runner is the red-for-nothing that #27 recorded twice, so it goes to 1.2 (0.933 × 1.25 = 1.166). Every other step moves down or stays: a laptop-set ceiling that CI reads well under is left, and lowered by the next PR from the CI series. A raise under this rule is only ever from a laptop step to its own CI derivation, never above the ceiling the pair had before the fix (10.85 for slice); anything else still needs a decision of its own. Escalated because a ceiling moving in the loosening direction is the owner's call: the default stands until they say otherwise.
