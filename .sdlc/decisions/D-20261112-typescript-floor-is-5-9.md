---
id: D-20261112-typescript-floor-is-5-9
subject: 'The README said "TypeScript 5.7+" and the oldest line graded is 5.9. Which floor do we state?'
taken: 'Taken by the owner, 2026-11-12, accepting the recommendation in intent typescript-matrix ("ok lets execute") on chore/typescript-matrix (#1533)'
date: '2026-11-12'
superseded_by: —
---

**The stated floor is TypeScript 5.9. The README badge reads "TypeScript 5.9+".**

**Why.** A floor is a claim, and `scripts/typescript-matrix.test.ts` is what holds it: every
published declaration type-checks under the `tsc` of 5.9, 6.0 and 7.0. 5.7 and 5.8 were never run
here. `^5.7.0` was a range in `package.json` that had resolved to 5.9.3 for as long as the lockfile
shows, so "5.7+" was written and never measured.

**Rejected: add `typescript-5.7` and `typescript-5.8` to the matrix.** Two more compilers in every
install and ten more cells, to back a number nobody chose. If an adopter on 5.7 or 5.8 reports a
failure, that line joins the matrix as one alias and the floor moves with the evidence.
