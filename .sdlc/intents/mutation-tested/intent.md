# Intent — a test suite that passes on broken code is found, not assumed away

> Stage 1 artifact. Batch 2 of the roadmap-to-shipped program. Opened from the owner's directive
> of 2026-10-18: "everything should go through quint and striker in terms of detecting bugs,
> fp/fn".

**Status:** shipped · **Opened:** 2026-10-18 · **Owner:** @ofri-peretz · **Shipped:** 2026-10-26, on the first weekly run's floors (see [§ Shipped — 2026-10-26](#shipped--2026-10-26))

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
  direction for once. **A second one surfaced on the first full run**: the runner's "related
  files" narrowing found no suite for some unfiltered mutant runs, and 84 mutants in
  `roundel/src/import.ts` "survived" having run nothing. The refusal built for the first defect
  caught the second — the run was rejected, not reported — which is the case for building it.

## Affected users and systems

- Every pull request: one more heavy job in `quality-full.yml`, reported in the `Quality (Full)
  Gate` summary and feeding its result. It is **not** added to branch protection's required
  contexts (`REQUIRED_CHECKS` in `scripts/lint-workflows.ts` is unchanged).
- `main`: a new weekly workflow, `mutation.yml`, that opens a PR with each week's observations
  like `bench.yml` and `control-bands.yml` do.
- The root `package.json`: `@stryker-mutator/core` and `@stryker-mutator/vitest-runner`, both
  `10.0.0` (published 2026-08-14), as devDependencies. No package gains a dependency.
- Package sources: one comment pair. `roundel/src/picocolors.ts` exports
  `picocolors as 'module.exports'`, a string export name Stryker 10 cannot place a mutant in
  (it aborts the whole run), so that one line carries
  `// Stryker disable StringLiteral: <reason>` … `// Stryker restore StringLiteral`. A
  `// Stryker disable` comment is the only thing this can ask a package to carry.

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

## Build status — 2026-10-18

**Built, not shipped: three of the four criteria are met by checks run green; the burgee floor
is not.** Status stays `approved` until it is.

- **Lock passes** — met. `npx vitest run --config vitest.root.config.ts
  scripts/mutation-lock.test.ts scripts/quality-full-trigger-lock.test.ts`: 44 passed.
- **Red then green** — met. On a scratch branch over `667ac99f6c`, `roundel/src/contrast.ts`
  gained `bestContrast`, tested inside a `describe` with `toBeGreaterThan(1)`: `npx tsx
  scripts/mutation.ts changed --event pull_request --base 667ac99f6c` exited 1, 2 of 4 mutants
  survived (`contrast.ts:95:10` ArithmeticOperator `* 100`, `contrast.ts:95:21`
  MethodExpression `Math.min`). With `toBe(21)` in both argument orders it exited 0, 4 of 4
  killed. With the vitest-5 shim disabled, the same green branch exited 1 and the run was
  refused: 4 covered mutants, 0 tests run.
- **Floors from real runs** — **not met.** `roundel`: 79.41% (864 of 1,088 detected; 223
  survived, 1 uncovered), a full run at `667ac99f6c`, floor 79.4. `burgee`: its full run was
  stopped at 5,078 of 11,825 mutants, so it is `unmeasured` with that reason and no score is
  claimed; its first weekly run sets the floor. Every other package is `unmeasured` with its
  reason (linegauge's is a suite that cannot pass instrumented).
- **Workflows** — met. `npx tsx scripts/lint-workflows.ts`: 23 workflow files pass; every
  action is SHA-pinned; `mutation` is not in `REQUIRED_CHECKS`.

## Shipped — 2026-10-26

**All four criteria are met; the one open on 2026-10-18 closed on the first scheduled run.**

| criterion | state | evidence |
| :-- | :-- | :-- |
| `scripts/mutation-lock.test.ts` passes | met | `npx vitest run --config vitest.root.config.ts scripts/mutation-lock.test.ts scripts/quality-full-trigger-lock.test.ts`, green on `main` at `8550bdbd6c`, 2026-10-26 |
| the PR-lane script red on an unkilled mutant, green once a test kills it, both recorded | met | § Build status — 2026-10-18 above |
| a floor for `burgee` and for `roundel` or `linegauge`, each from a real full run; every other package `unmeasured` with a reason | met | `.sdlc/bands/mutation-ratchets.json`, landed by #1229 from the scheduled `mutation.yml` run 40074196603 (2026-10-24, at `80c8eaa52b`): `burgee` floor 90.9 (90.95%, 12,495 of 13,738 detected, 186 minutes in a 300-minute cell); `roundel` 79.4 → 83.2 (83.22%). caique 87.8, compat-oracle 91.4, controlroom 92.4 and paratext 85.2 were measured for the first time too |
| `lint-workflows` passes with the job and workflow, SHA-pinned; the trigger lock holds the new job | met | `npx tsx scripts/lint-workflows.ts`: 23 workflow files pass, 2026-10-26; `quality-full-trigger-lock.test.ts` green |

**Five packages are still `unmeasured`, each with a reason, and the reason in the file is
thinner than it should be.** The ratchet file says "Stryker exited 1 without a report — its own
error is above", which points at a log that expires. The run's logs say why:

| package | job | why Stryker stopped |
| :-- | :-- | :-- |
| `bellpull` | 120813958614 | `src/cross-spawn.ts:115:44`: Stryker 10 cannot place a `StringLiteral` mutant in an `export` specifier (the `'module.exports'` string export name, the same one `roundel/src/picocolors.ts` carries a disable comment for) |
| `seniority` | 120813958785 | `src/dotenv.ts:266:19`: the same placement error |
| `closeout` | 120813958777 | the initial, unmutated test run failed under Stryker |
| `flagstaff` | 120813958857 | the initial, unmutated test run failed under Stryker |
| `linegauge` | 120813958817 | the initial, unmutated test run failed under Stryker (the 2026-10-18 reason: a suite that cannot pass instrumented) |

Criterion 3 asks for those packages to be `unmeasured` with a reason, and they are; it does not
ask for every package to be measured, so these do not hold the stamp. Getting each one a floor
is follow-up work; the first two meet the placement error `roundel` already works around.

## Open questions

None open. Decided while writing it (D-20261018-mutation-tested):

- Decided: **burgee's weekly cell gets 300 minutes.** The local seed run tested 5,078 of its
  11,825 mutants in 37 minutes at concurrency 2 (about 86 minutes for all of them); 300 is
  more than three times that, for a shared runner. If
  a scheduled run overruns, the cell produces no score, which for a measured package is a
  breach — the overrun is reported, not hidden.
- Decided: **the runner defect is not reported upstream by an agent.** A public issue is filed
  in the owner's name, so it is listed for him in the PR, with the reproduction in the spec.
