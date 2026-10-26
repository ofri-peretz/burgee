---
id: D-20261026-oxmutate-equivalent-mutants
subject: 'oxmutate: how are mutants that no test can kill (equivalent mutants) scored?'
taken: 'Taken — by the agent under the owner''s 2026-10-12 delegation over budgets and trade-offs; revisited at M1 G0'
date: '2026-10-26'
superseded_by: —
---

**They are reported as `equivalentCandidate` with the reason recorded, and excluded from the score;
the default heuristic is decided in M1 (spec R10).** Stryker has no such status: an equivalent
mutant is a permanent survivor there unless a person writes `// Stryker disable` with a reason.
Excluding without a recorded reason would let a weak suite look strong, so every exclusion carries
one and is listed in the report.
