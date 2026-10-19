---
id: D-20261018-mutation-tested
subject: 'How is "every change goes through Stryker" enforced: on what, how fast, and against which number?'
taken: 'Taken — on the owner''s directive of 2026-10-18 and his delegation of 2026-10-12 over budgets and trade-offs'
date: '2026-10-18'
superseded_by: —
---

**A pull request is mutated on the lines it changed, and fails on any undetected mutant there;
each package's full score is measured weekly on `main` and held by a floor that only rises.**
The PR lane is `Mutation (changed lines)` in `quality-full.yml`, fifteen minutes at most, feeding
the `Quality (Full) Gate` summary and result but not a required context of its own. The weekly
run is `mutation.yml`. The floors live in `.sdlc/bands/mutation-ratchets.json`. Stryker
`10.0.0` and its vitest runner are root devDependencies; no package gains a dependency.

**Why.** A surviving mutant is a suite that passes on broken code — rule 4 of the working model,
per line. Line coverage is already 100% across the family and says nothing about whether an
assertion would notice the line being wrong. Changed lines, not changed files, because a
one-line fix must not owe every old survivor in its file; the weekly ratchet owns those.

**What it risks.**

- *A false survivor blocking an honest PR.* It happened on the first run: the vitest runner's
  name filter matches nothing under vitest 5, so mutants run zero tests and "survive".
  `scripts/mutation-vitest-setup.ts` widens the filter, and a report with a covered survivor
  that ran no test is refused as an instrument fault rather than counted.
- *A large PR overrunning the budget.* It fails saying so; it does not pass unmeasured.
- *Equivalent mutants.* `// Stryker disable next-line <Mutator>: <reason>`, and the lock refuses
  one without a reason.

**Reversal.** Drop the `mutation` job from `quality-full.yml` and its `needs` edge; the weekly
workflow and the ratchet file can stay as a band that reports.
