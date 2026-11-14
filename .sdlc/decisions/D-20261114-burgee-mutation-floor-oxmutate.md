---
id: D-20261114-burgee-mutation-floor-oxmutate
subject: 'burgee measured 88.55% against a mutation floor of 90.9 set by a Stryker run: restate the floor for oxmutate, or kill the survivors?'
taken: 'Taken — by the session closing the gap, under the owner''s standing delegation of mutation trade-offs, 2026-11-14'
date: '2026-11-14'
superseded_by: —
---

**burgee's floor stays at 90.9. It is not restated, because oxmutate now measures it above that
number: 91.41% (14,747 detected of 16,132) at d742cb34c4, against 88.98% (14,355 of 16,132) at
6eab29066a before the change.** Both are full runs of `scripts/mutation.ts full --package burgee`
under oxmutate at concurrency 8. The after run took 346 minutes on a loaded machine and counted 139
timeouts to the before run's 98; without those 41 extra it is still 91.16%.

**The two numbers come from different mutant sets.** The floor was set on 2026-10-24 by a Stryker
run at 80c8eaa52b: 90.95%, 12,495 detected of 13,738. oxmutate generates about 2,400 more mutants
over the same sources (16,132 on 2026-11-14), NumericLiteral among them, which the 2026-11-01
restatement (`D-20261101-mutation-floors-numericliteral-restate`) never applied to burgee. So the
floor was a Stryker number held against an oxmutate run. Restating it to what oxmutate measured
would have been allowed by that precedent. It was not needed: most of the gap was suites the
mutation run skipped, and a check nobody ran in-process.

**What closed it, measured per file with oxmutate before and after (detected of total):**

| file | before | after | what changed |
| --- | --- | --- | --- |
| `testing-helpers.ts` | 64 of 167 | 159 of 167 | `testing-helpers.test.ts` was skipped whole for two env-ordering cases; they moved to `testing-helpers-env.test.ts`, which alone is skipped |
| `brand.ts` | 267 of 447 | 440 of 447 | `brand-golden.test.ts` pins each surface's bytes; the only check of the geometry was `npm run brand -- --check`, in a separate process against `dist/` |
| `messages.ts` | 15 of 101 | 101 of 101 | `messages-catalog.test.ts`: no catalog template is empty |

**SKIPPED_TESTS, checked one by one under oxmutate** (each by a run of the file it covers, with
the skip and without it):

- `testing-helpers.test.ts` — the reason named Stryker's `threads` pool, but oxmutate's dry run
  fails the same case (`swapEnv (R7 lock) › leaves process.env byte-identical…`): restoring the env
  under a mutation runner reorders its keys either way. Only the two byte-for-byte cases need the
  skip, so they are in their own file and the skip names it.
- `messages.test.ts` — passes under oxmutate, which does not write instrumented source to disk.
  But it parses every writer with TypeScript per mutant: unskipped, `messages.ts`'s 101 mutants
  took 225 minutes instead of 13, for 44 more kills. Kept skipped; the new catalog test kills all
  101 in about a minute.
- `migrate-bench.test.ts` — oxmutate's dry run fails its three timings, as Stryker's did. Kept.
- `shape.test.ts` — installs the packed tarball and runs `dist/`. Over `pkg.ts` and `agent.ts`,
  skipped and unskipped scored the same, 69 killed and 7 survived. Kept.

**The survivors left in the three files are equivalent or named.** brand.ts: rounding at exactly
the epsilon (`<` vs `<=`), a spread of the same array, an empty-text early return whose fall-through
yields the same lines, and a block height only read when there are lines. testing-helpers.ts: the
timer ids' starting value, a `tty === false || tty === undefined` branch whose fall-through spreads
to the same object, and a tie-breaking comparator V8's sort leaves equivalent here. One was a real
gap: `runBurgee` keeps the TTY-ness of a caller's own stdin stream when `tty` is not given
(`testing-helpers.ts`, the `stdin:` line), and no test passed such a stream.
`testing-harness-stdin.test.ts` now does, proven red on that mutant by hand. It landed after the
full run started, so the 91.41% above does not count it.

**Reversible.** The weekly run records the next observation and raises the floor on its own if it
beats it. A later decision can restate it if oxmutate's mutant set changes again.
