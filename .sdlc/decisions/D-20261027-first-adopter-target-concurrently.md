---
id: D-20261027-first-adopter-target-concurrently
subject: 'first-adopter: which CLI is the one disclosed external pull request aimed at, and is it ready to post?'
taken: 'open-cli-tools/concurrently, answering its #418. Proven and drafted, held until A-20261027-yargs-parsesync-surfaces-throw ships and the owner approves the target and text. Taken by the agent preparing the build under the 2026-10-27 owner rule; the post is the owner''s'
date: '2026-10-27'
superseded_by: —
---

**The target is [open-cli-tools/concurrently](https://github.com/open-cli-tools/concurrently).
The pull request answers its open
[#418](https://github.com/open-cli-tools/concurrently/issues/418), "Switch from yargs to commander
to remove 16 dependencies".** The evidence, the rejected candidates and the transcript are in
[`.sdlc/research/adoption/concurrently.md`](../research/adoption/concurrently.md). The draft is
[`adoption-draft.md`](../intents/first-adopter/adoption-draft.md).

**Why concurrently.** The spec's three filters
([D-20261025-first-adopter-design-accepted](./D-20261025-first-adopter-design-accepted.md)) each
hold:

- It pins yargs 18.0.0, which `burgee/yargs` grades at 816 / 816.
- It has an open issue the swap answers, on the terms its top maintainer wrote in 2024: full
  compatibility and decent TypeScript types. His other objection was ESM-only libraries, and
  concurrently itself went ESM-only in 2025-10.
- The source diff is 4 lines.

The outreach rules hold too. There is no CLA, no stale bot, no AI reviewer and no release-age
window. Outside pull requests are merged within days. The repository does not shrink its
dependencies by policy, and this change removes 7 packages rather than adding one.

**Why not the five A and B targets in
[`adoption-targets.md`](../research/adoption-targets.md).** Each fails an outreach rule the
targets list predates:

- devcontainers/cli: a Microsoft CLA, and a governed organisation.
- semantic-release: it holds publish tokens.
- spectral: corporate, with slow triage.
- pa11y-ci and pa11y: they are shrinking their dependencies, and on commander the swap adds five
  packages.

apify/mcpc already closed the one burgee PR it was sent. The list said to send its C targets
only after an A or B merged. That ordering assumed an A or B could be sent at all, and none can.
concurrently's #418 is an open ask from the maintainer, so the "no issue" reason for holding C
targets back does not apply to it.

**What the proof found.** On the project's own suite, A3 holds:

- `burgee@1.7.2 migrate` leaves 649 / 649 green on Node 22, 24 and 26, with `--help`
  byte-identical.
- `git revert` restores the exact tree, and the suite stays green after it.

Off the suite it does not hold. 2 of 40 argument vectors crash with a stack trace (`--mcp`,
`completion zsh`), because `parseSync()` throws on the promise burgee's lazy surfaces return.
That is a burgee bug, recorded as
[A-20261027-yargs-parsesync-surfaces-throw](../gaps/A-20261027-yargs-parsesync-surfaces-throw.md).
It is not worked around in the target, and **the PR is not posted until the fix ships** and the
proof is re-run on that published version.

**Decided not to fix, and said in the draft instead:**

- **The agent surfaces are close to empty on concurrently.** It runs its work after `parseSync()`
  and registers no handler. Both façades list only runnable commands; a commander program with no
  `.action()` prints `"commands": []` too. So the PR claims nothing for `--schema`, `--mcp` or
  completions. Moving the run into a `$0` handler is the adopter's choice and a separate change.
- **Engines.** burgee's `>=22.13.0` sits one patch line above yargs 18's own `^22.12.0`, and
  concurrently says `>=22`. The binary runs on 22.11 and 22.12. D-132's floor stands.

The pin style friction is
[B-20261027-migrate-pins-match-exact-convention](../gaps/B-20261027-migrate-pins-match-exact-convention.md).

**The pitch.** Fewer packages (19 → 12), the yargs API kept, typecheck passes, and the revert is
one command. It is never "lighter": the dependency bytes grow by 1.2 MB, and eight maintainer
accounts become one. The body says both.

**Status of the intent.** It stays `approved`. Build steps 1 and 2 are done; step 3 is drafted
and held. A1 and A6 close only on a merge in concurrently, and first-adopter is not stamped
`shipped` before that.
