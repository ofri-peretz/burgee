# Design — `first-adopter`

Intent: [`intent.md`](./intent.md). **Status:** shipped (2026-11-02).

---

## A5 graded 2026-11-02: met, so the intent ships

B1 now runs against oxmutate as well as the demo
([D-20261101-b1-oxmutate-arm](../../decisions/D-20261101-b1-oxmutate-arm.md)). The arm has its own
four tasks, a shim named `oxmutate`, and runs on the owner's machine only, by the owner's "No
oxmutate in GHA": `npm run bench -- --axis agent --arm oxmutate`. So A5 is graded on three local
readings, not on the scheduled run the gap expected. Each was 20 task-runs at `d71dcb0`, whose
oxmutate source is `oxmutate@1.1.0`'s, with load below 30 throughout.

| A5 reading | median of 3 | range |
| :-- | --: | :-- |
| success rate, gated at 0.8 | **1.00** | 0.95–1.00 |
| tokens per task | 62,795 | 62,535–94,273 |
| turns per task | 3 | 2–4 |
| tokens per reading (20 runs) | 2,155,006 | 1,923,261–2,158,733 |
| list-price cost per reading | $1.90 | $1.78–$1.91 |

The files are in `benchmarks/results/agent-cli-bench-oxmutate/`, and the third carries the
graded `success-rate-readings-median`. One earlier reading, taken before the arm allowed
`npx oxmutate`, is kept under `superseded/` and not graded; the decision says why. With A1–A4 held
and A6 a recorded miss carried by [C3](../../gaps/C3.md), A5 was the last criterion, and the intent
is stamped `shipped`.

## Graded on oxmutate 2026-11-01

The owner ruled oxmutate the first adopter
([D-20261101-first-adopter-is-oxmutate](../../decisions/D-20261101-first-adopter-is-oxmutate.md)).
That replaces the Acceptance line below, which said A1 and A6 close only on a merge in someone
else's repository: A1 closes on oxmutate, which is published from this one.

| id | grade | held by |
| :-- | :-- | :-- |
| A1 | met | `npm view oxmutate@1.1.0 dependencies`: `burgee ^1.9.2`, `bellpull ^1.0.10` |
| A2 | met; time is a calendar span, not an effort figure | [`.sdlc/research/adoption/oxmutate.md`](../../research/adoption/oxmutate.md) |
| A3 | met by concurrently's proof; does not apply to oxmutate | [`.sdlc/research/adoption/concurrently.md`](../../research/adoption/concurrently.md) |
| A4 | met | five gaps and one decision filed 2026-11-01, listed in the decision |
| A5 | **met** 2026-11-02 (was **open**): success rate median 1.00, range 0.95–1.00, over three local readings | [D-20261101-b1-oxmutate-arm](../../decisions/D-20261101-b1-oxmutate-arm.md); gap [B-20261101-b1-real-cli-arm-oxmutate](../../gaps/B-20261101-b1-real-cli-arm-oxmutate.md), closed |
| A6 | **not met**, moved to C3 | [C3](../../gaps/C3.md) |

The intent ships when A5 holds: the real-CLI arm is built and a scheduled B1 run lands a reading.
*Restated 2026-11-02: the arm runs locally only, so three local readings, by
D-20261101-b1-oxmutate-arm. A5 holds; see § A5 graded 2026-11-02.*

---

## Design gate 2026-10-25

**Accepted for Build, with the design rewritten**
([D-20261025-first-adopter-design-accepted](../../decisions/D-20261025-first-adopter-design-accepted.md)).
The "Design" section below predates the 2026-09-06 decision that burgee *replaces*
commander rather than layering on it. Where it and this section disagree, this section is the
design.

**What changed since it was written.**

- The layer is the published family: `burgee` (`burgee/commander`, `burgee/yargs`), the output
  stack, and the foundation layers. A1 already says so, and A6 covers a lone layer.
- One attempt has run. The U12 trial ran `burgee migrate` measure-only on apify/mcpc and on
  mac-cleaner-cli, and
  [D-20261008-migrate-u12-findings](../../decisions/D-20261008-migrate-u12-findings.md) fixed its
  five findings, mock specifiers among them. The outside candidate is apify/mcpc#447
  (gap C3), still unmerged.
- The pitch is fewer packages, compatibility graded by the incumbent's own suite, and the agent
  surfaces. It is never "lighter": the family adds bytes per layer.

**The build, in order.**

1. Choose the target by the three filters below, from `.sdlc/research/dependents.md` and
   `.sdlc/research/issues/`. Record the choice and the issue it answers in
   `.sdlc/research/adoption/<target>.md`. Check the repository's contribution gates (CLA,
   stale-close, required reviewers) before any work.
2. A3 first. Run `burgee migrate` on a fork, run the project's own suite green, then revert in
   one commit and run it green again. If the revert is not one clean commit, stop and file the
   friction as an intent (A4) before going on.
3. Open one working pull request that cites the project's own issue and discloses who wrote the
   layer. Write A2's report in the same file, and have someone who did not build the layer
   review it.
4. A5's B1 variant against the real CLI waits for a merged adoption.

**Acceptance.** Steps 1–3 are the batch. A1 and A6 close only on a merge in someone else's
repository, which no batch can schedule. Until then the intent stays `approved` with its build
done. Each friction point found becomes an intent or a recorded decision (A4) in the same batch.

## Requirements

| id | Requirement |
| :-- | :-- |
| A1 | One non-demo CLI depends on ~~`commander-agent`~~ a burgee-family package in a published release. **Restated 2026-10-19:** `commander-agent` is a dropped intent; the published packages are `burgee` and its family |
| A2 | An adoption report records time, diff size, breakages and gaps, written by someone who did not build the layer |
| A3 | A revert branch removes the layer in one commit and is green, proving reversibility |
| A4 | Every friction point becomes an intent or a recorded decision not to fix it |
| A5 | `cli-benchmarks` B1 runs against the real CLI as well as the demo |
| A6 | **Moved here 2026-10-19.** One CLI we did not write installs a single layer **alone, without `burgee`**, in a published release. Owns the adopter half of `burgee` U12 (D-20261009-burgee-u12-1-0; gap `.sdlc/gaps/C3.md`, candidate apify/mcpc#447, unmerged) and `cli-foundation-stack` S5, which asks the same of a foundation layer (`linegauge`, `seniority`, `bellpull`, `closeout`). The engineering half, that each tarball installs alone, is held by `scripts/independence-install-lock.test.ts` and is not part of A6 |

## Design

Two targets, in order.

**Target one — Interlace `eslint` tooling.** Real users, real commands, and we control
the merge, so it can happen in wave 2 without waiting on anyone. The review is delegated:
the person who writes the adoption report must not be the person who wrote
~~`commander-agent`~~ the burgee family (restated 2026-10-25: `commander-agent` was dropped). Rule 3 of the SDLC already says the agent that wrote the code does not
approve it; here it is applied to the adoption verdict.

**Target two — a small external OSS CLI.** Chosen by three filters: it already uses
commander, it has an issue in our research corpus asking for something the floor
provides, and it is small enough that a maintainer can review the diff in an evening.
Approach is a working pull request that cites their own issue, not an issue asking
permission. The `.sdlc/research/issues/` snapshots already identify candidates.

**Order.** A3 before A1: write the revert branch first, so reversibility is proven on the
way in rather than asserted on the way out. If the revert is hard, stop and fix the layer
before shipping the adoption.

## Verification

The adoption report is the artifact and the revert branch is the check. A2 has no
automated gate on purpose — the finding here is qualitative, and a green pipeline would
tell us nothing about whether adoption was pleasant.

A5 is automated: `npm run bench -- --axis agent` gains a variant pointing at the real CLI.
*Built 2026-11-01 as `npm run bench -- --axis agent --arm oxmutate`, run locally only
(D-20261101-b1-oxmutate-arm); `benchmarks/oxmutate-arm.test.ts` and `benchmarks/tasks.test.ts`
hold the harness and the checks.*

## Rejected alternatives

- **Waiting until the floor is complete.** Four more waves built on an unvalidated floor
  is the expensive version of this discovery. Partial adoption of a partial floor is the
  point.
- **A survey or interviews instead of an adoption.** What people say they would install
  and what they install differ; stricli presumably interviewed well.
- **Only an external target.** A failed external PR teaches us less than a completed
  internal adoption with an honest reviewer, and it cannot be scheduled.
- **Only an internal target.** An Interlace repo cannot tell us whether a stranger can
  adopt this from the README alone, which is the question that decides the project.

## Out of scope

- Marketing, launch posts, or a public adopters list. One adopter is a test, not a
  testimonial.
- Adopting the compat front-ends; wave 5 is conditional and this intent is about the
  layer.
