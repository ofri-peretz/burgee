---
id: D-20261026-oxmutate-type-check-mutants
subject: 'oxmutate: are mutants type-checked before they run, at a speed cost?'
taken: 'Taken — by the agent under the owner''s 2026-10-12 delegation over budgets and trade-offs; revisited at M1 G0'
date: '2026-10-26'
superseded_by: —
---

**Yes, kept, parallel, with `tsgo`, and the compile-error drop count is reported (spec R6).**
Without it a mutant that does not type-check is counted as killed when it crashes, which inflates
the score. Stryker drops type-invalid mutants silently through its TypeScript checker; reporting
the count makes the drop rate visible. Not in the M0 spike (es-toolkit's array module produced no
compile errors to drop), so the speed cost is measured in M1.
