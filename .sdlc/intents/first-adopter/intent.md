# Intent — `first-adopter`: a CLI we did not write uses the layer

**Status:** review · **Opened:** `2026-09-06` · **Owner:** `@ofri-peretz`

**State assigned 2026-09-09** from repo evidence, at the owner’s direction. **Why still `review`:** no external CLI has been migrated; A1–A5 are all open.

---

## What is wanted

At least one CLI that is not `examples/demo-cli-*` depends on `commander-agent` in
production, and its maintainer can say what it cost them to adopt and what it bought.

Target one: the Interlace `eslint` repo's own tooling — ours, but real, with real users
and no incentive to flatter the layer. Target two: a small external OSS CLI, approached
with a pull request rather than a pitch.

## Why now

Every number the project has is measured against a CLI we wrote in order to measure it.
`cli-benchmarks` B1 compares our layer against our own strawman; the conformance suite
tests our own demo; the floor was derived from other people's issues but validated
against nobody. That is a closed loop and it will flatter us in exactly the places where
we are wrong.

`.sdlc/research/architecture-review.md` §1.3. The finding that matters most is the one
this intent can produce and nothing else can: **if no real CLI will take it, that is the
project's most important result**, and it is much cheaper to learn in wave 2 than in
wave 5 after four more waves are built on the assumption.

## Affected users and systems

- A pull request to a repository we do not control (target two).
- `cli-benchmarks` gains a real-CLI row alongside the demo row.
- The floor gains whatever the adopter's friction reveals; expect requirements to change.

## Constraints

1. **The adopter's maintainer is not us.** Target one may be an Interlace repo, but the
   review must come from someone who did not write the layer.
2. **Adoption must be reversible in one commit**, and we demonstrate that by reverting it
   on a branch. If it cannot be cleanly removed, the layer's central claim is false.
3. **No special-casing.** If the adopter needs a change, it lands as a floor requirement
   for everyone, never as a private accommodation.
4. Approach target two with a working PR, not an issue asking whether they would like one.

## Success criteria

1. One non-demo CLI ships a release depending on `commander-agent`.
2. A written adoption report: time taken, lines changed, what broke, what was missing.
3. Every friction point is either a new intent or a recorded decision not to fix it.
4. The revert branch exists and is green, proving constraint 2.
5. `cli-benchmarks` reports B1 for the real CLI, not only the demo.

## Verified against `main` — 2026-09-09

Checked criterion by criterion on `61bd11b9`. **Zero of five met.** The status stays `review`.

Stated plainly: **there is no external adopter, and no internal one either.**
`registry.npmjs.org/-/v1/search?text=depends:burgee` returns `{"objects":[],"total":0}`. The only
things in the world that import `burgee` are `examples/demo-cli-*` and the private
`compat-oracle`, all in this repo.

- **One non-demo CLI ships a release depending on the layer** — not met, and **stale twice**: it
  names `commander-agent`, which is a `dropped` intent, and the package that shipped is `burgee`.
- **A written adoption report — time taken, lines changed, what broke, what was missing** — not
  met. The one artifact this intent has produced is `.sdlc/research/dependents.md`, generated
  2026-09-08 by `scripts/rank-dependents.ts`: the top 50 commander and top 50 yargs dependents by
  weekly downloads (terser, sucrase, svgo, katex, webpack-cli…). That is a **prospect list**, not
  adoption, and the README should not read as though the lane has moved past it.
- **Every friction point is a new intent or a recorded decision not to fix it** — not met; no
  friction has been encountered, because nothing has been adopted.
- **The revert branch exists and is green** — not met; no such branch in the 27 heads on `origin`.
- **`cli-benchmarks` reports B1 for the real CLI** — not met; `cli-benchmarks` does not exist.

This intent's own "Why now" says that if no real CLI will take it, *that is the project's most
important result*. **That result has not been produced either way.** The work has not been
attempted past ranking the candidates, and this is bet 3 of the three the roadmap says everything
else is conditional on.

## Open questions

None open. Decided at finalisation (2026-09-06): wave 2, not later, because four more
waves built on an unvalidated floor is the expensive version of this discovery; and an
internal-but-real target first, because a failed external PR teaches us less than a
completed internal adoption with an honest reviewer.
