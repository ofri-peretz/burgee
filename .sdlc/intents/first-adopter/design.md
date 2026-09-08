# Design — `first-adopter`

Intent: [`intent.md`](./intent.md). **Status:** review.

---

## Requirements

| id | Requirement |
| :-- | :-- |
| A1 | One non-demo CLI depends on `commander-agent` in a published release |
| A2 | An adoption report records time, diff size, breakages and gaps, written by someone who did not build the layer |
| A3 | A revert branch removes the layer in one commit and is green, proving reversibility |
| A4 | Every friction point becomes an intent or a recorded decision not to fix it |
| A5 | `cli-benchmarks` B1 runs against the real CLI as well as the demo |

## Design

Two targets, in order.

**Target one — Interlace `eslint` tooling.** Real users, real commands, and we control
the merge, so it can happen in wave 2 without waiting on anyone. The review is delegated:
the person who writes the adoption report must not be the person who wrote
`commander-agent`. Rule 3 of the SDLC already says the agent that wrote the code does not
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
