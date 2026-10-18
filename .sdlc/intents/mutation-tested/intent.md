# Intent — a test suite that passes on broken code is found, not assumed away

> Stage 1 artifact. Batch 2 of the roadmap-to-shipped program. Opened from the owner's directive
> of 2026-10-18: "everything should go through quint and striker in terms of detecting bugs,
> fp/fn".

**Status:** approved · **Opened:** 2026-10-18 · **Owner:** @ofri-peretz

---

## What is wanted

1. **A pull request cannot add a line no test can tell is broken.** Stryker mutates the lines
   the PR added or changed, in the packages it affects, and the `Mutation (changed lines)` job
   fails when one of those mutants is not detected — unless the line carries
   `// Stryker disable next-line <Mutator>: <reason>`, and every such comment has a reason.
2. **Every package has a mutation score, measured on `main`, that only goes up.** A weekly
   full run records each package's score in `.sdlc/bands/mutation-ratchets.json`, raises a
   floor the run beat, and fails on a run below one. A package that has never been measured
   says why, and its first measurement becomes its first floor.

## Why now

- **The owner asked for it, for every package**, on 2026-10-18.
- **Rule 4 of the working model** — "a fix is not done until a check would have caught it" —
  is checked today only for the fix a person remembered to test. A surviving mutant is that
  rule failing on a line nobody looked at: the code changed, and every test still passed. 100%
  line coverage, which every package here holds, says a line *ran*; it does not say any
  assertion would notice it being wrong. The memory index records the cost of the difference
  twice over (NestJS plugin: 100% coverage still hid 10 FPs and 6 FNs; "tests that pass on the
  broken code").
- **Measured before designing, on 2026-10-18** (`roundel/src/contrast.ts`, lines 69–100, 27
  mutants): 92.59% detected, and the two survivors are real gaps — the hex-colour regex loses
  either anchor (`^` or `$`) and every test still passes.
- **The first run also found a defect in the instrument.** `@stryker-mutator/vitest-runner`
  10.0.0 filters a mutant's run by test name joined with spaces; vitest 5 matches the filter
  against names joined with ` > `, so every test inside a `describe` is skipped, the run reports
  zero tests and no failure, and Stryker records the mutant as **Survived**. On that same range
  it turned two killed mutants into survivors. A mutation gate built without noticing that
  would have failed honest pull requests on mutants their own tests kill — the exact class of
  checker defect `checkers-commit-the-fault-they-police` records, here in the unflattering
  direction for once.

## Affected users and systems

- Every pull request: one more heavy job in `quality-full.yml`, reported in the `Quality (Full)
  Gate` summary and feeding its result. It is **not** added to branch protection's required
  contexts (`REQUIRED_CHECKS` in `scripts/lint-workflows.ts` is unchanged).
- `main`: a new weekly workflow, `mutation.yml`, that opens a PR with each week's observations
  like `bench.yml` and `control-bands.yml` do.
- The root `package.json`: `@stryker-mutator/core` and `@stryker-mutator/vitest-runner`, both
  `10.0.0` (published 2026-08-14), as devDependencies. No package gains a dependency.
- Package sources: none change. A `// Stryker disable` comment is the only thing this can ask a
  package to carry.

## Constraints

1. **Packages stay zero-dependency.** Stryker is a root devDependency only;
   `check:artifacts`, the dependency locks and every package's `package.json` are untouched.
2. **The PR lane stays well under fifteen minutes**, so it does not become the long pole of a
   required gate: job timeout 15, Stryker budget 11.
3. **A gate that cannot measure fails, it does not pass.** A report with a covered survivor
   that ran no test is refused; a run over budget fails saying so.
4. **No floor is a number nobody measured.** Every floor comes from a full run; a package not
   yet run is `unmeasured` with its reason.
5. **The mutation denominator is the coverage denominator** — the same exclusions
   (`TESTED_IN_ANOTHER_PROCESS`, tests, `__fixtures__`), imported, not copied.

## Success criteria

- `scripts/mutation-lock.test.ts` passes: line selection, scoring, the silent-survivor refusal,
  the disable-reason rule over every package source, the ratchet rules, and `record`'s four
  outcomes.
- The PR-lane script, run on a branch whose changed function has a mutant no test kills, exits
  non-zero and names it; after a test that kills it is added, it exits zero. Both runs recorded.
- `.sdlc/bands/mutation-ratchets.json` holds a floor for `burgee` and for `roundel` or
  `linegauge`, each from a real full run done for this intent, and every other package is
  `unmeasured` with a reason.
- `npx tsx scripts/lint-workflows.ts` passes with the new job and workflow, actions pinned by
  SHA, and `quality-full-trigger-lock.test.ts` holds the new job to the same trigger as the
  other heavy jobs.

## Open questions

None open. Decided while writing it (D-20261018-mutation-tested):

- Decided: **burgee's weekly cell gets 300 minutes**, from the local seed run's duration. If
  a scheduled run overruns, the cell produces no score, which for a measured package is a
  breach — the overrun is reported, not hidden.
- Decided: **the runner defect is not reported upstream by an agent.** A public issue is filed
  in the owner's name, so it is listed for him in the PR, with the reproduction in the spec.
