# Intent — `first-adopter`: a CLI we did not write uses the layer

**Status:** approved · **Opened:** `2026-09-06` · **Owner:** `@ofri-peretz`

> **Accepted at the Design→Build gate 2026-10-25** by the coordinator under the owner's delegation
> ([`D-20261025-first-adopter-design-accepted`](../../decisions/D-20261025-first-adopter-design-accepted.md)): the design rewritten off `commander-agent` onto the published family and the U12 trial's lessons. See
> [`spec.md` § Design gate 2026-10-25](./spec.md#design-gate-2026-10-25).

**Build 2026-10-27: prepared, awaiting owner approval to post.** The target is
open-cli-tools/concurrently, answering its #418
([D-20261027-first-adopter-target-concurrently](../../decisions/D-20261027-first-adopter-target-concurrently.md)).
A3 is proven in a local clone: `burgee@1.7.2 migrate` keeps its suite at 649 / 649 on Node 22,
24 and 26, and one `git revert` restores the exact tree, green again
([`concurrently.md`](../../research/adoption/concurrently.md)). The disclosed PR is drafted in
[`adoption-draft.md`](./adoption-draft.md). It is **held, not posted**, until the
`parseSync()` fix publishes and the owner approves the target and the text. It was blocked on
[A-20261027-yargs-parsesync-surfaces-throw](../../gaps/A-20261027-yargs-parsesync-surfaces-throw.md)
(`--mcp` and `completion` crashed `parseSync()` programs). That is fixed in #1311, which
publishes with burgee's next release; the A3 proof is then re-run on the published version.
The same pull request closes
[B-20261027-migrate-pins-match-exact-convention](../../gaps/B-20261027-migrate-pins-match-exact-convention.md),
so `migrate` writes the exact pin the draft had set by hand. Nothing has been sent outside
`ofri-peretz/*`. A1 and A6 stay open until a merge upstream, so this intent is not `shipped`.

**Re-run on `burgee@1.8.0`, 2026-10-27: held again, comment not posted.** The owner approved a
disclosed comment on #418 first (the PR to follow only on the maintainer's yes), on the condition
that the whole proof passed on the published fix. Everything passed but one check: the suite is
649 / 649 migrated and reverted on Node 22, 24 and 26, `--help` is byte-identical, `migrate` now
writes the exact pin, the revert restores the tree hash, and `completion zsh` prints a script. But
`concurrently --mcp` does not serve. It no longer crashes; concurrently's own `process.exit()` on
an empty argv ends the server `parseSync()` started, so it prints help exactly as yargs does.
That is [A-20261027-yargs-parsesync-mcp-ended-by-exit](../../gaps/A-20261027-yargs-parsesync-mcp-ended-by-exit.md).
The comment waits on that fix being published and the proof re-run on it
([`concurrently.md`](../../research/adoption/concurrently.md#re-run-on-burgee180-2026-10-27)).
The gap closed on 2026-10-28: under `parseSync()`, `--mcp` is now served synchronously and
returns only when its input ends
([D-20261028-yargs-parsesync-mcp-serves-synchronously](../../decisions/D-20261028-yargs-parsesync-mcp-serves-synchronously.md)).
The fix publishes with burgee's next release, and the proof is re-run on that version.

**Comment posted https://github.com/open-cli-tools/concurrently/issues/418#issuecomment-6455508479 on 2026-10-28; the PR follows on the maintainer's yes.** The owner chose
to post a revised text rather than wait for the `--mcp` fix: 38 of 41 argument vectors identical,
the three that differ (`--json`, `--schema`, `completion <shell>`) named with what each now does,
and `--mcp` stated as unchanged for concurrently, because concurrently does its work after
`parseSync()` returns. The comment does not promise the fix; the gap stays open in burgee. The
posted text is in [`adoption-draft.md`](./adoption-draft.md#posted-comment-2026-10-28). Status
stays `approved`: the intent ships only when an upstream PR merges.

**Proof green on `burgee@1.9.1`, 2026-10-28; PR opened 2026-10-28 as open-cli-tools/concurrently#639.** The A3 proof
was re-run on the published fix, against concurrently's default-branch HEAD, which is still
`2a80d44`. Every check passed: 649 / 649 base, migrated and reverted on Node 22, 24 and 26,
`--help` byte-identical, `migrate` writes the exact pin `"burgee": "1.9.1"`, the revert restores
the tree hash, `completion zsh` prints a script, and `concurrently --mcp` now answers `initialize`
and `tools/list`. 37 of 41 argument vectors are identical against a 41 / 41 control; the 4 that
differ are burgee's reserved shapes, `--mcp` now among them because it serves
([`concurrently.md`](../../research/adoption/concurrently.md#re-run-on-burgee191-2026-10-28)).
The owner approved opening the pull request without waiting for a maintainer reply, and opened it
from his own fork: <https://github.com/open-cli-tools/concurrently/pull/639>, `ofri-peretz:burgee-yargs`
at `d0da17b`. The commit, patch, title and posted body are in [`upstream/`](./upstream/). The
local `revert-proof` branch was not pushed. Status stays `approved`. A1 and A6 hold only on an
upstream merge, and A1 also needs a concurrently release that depends on burgee.

**State assigned 2026-09-09** from repo evidence, at the owner’s direction. **Why `review` until 2026-10-25:** no external CLI has been migrated; A1–A5 are all open.

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
