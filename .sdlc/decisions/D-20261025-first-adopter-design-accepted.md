---
id: D-20261025-first-adopter-design-accepted
subject: 'first-adopter: is the design, rewritten off the dropped commander-agent onto the published family and the U12 trial''s lessons, accepted for Build?'
taken: 'Accepted — by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-25'
date: '2026-10-25'
superseded_by: —
---

**Accepted. [`first-adopter/spec.md`](../intents/first-adopter/spec.md), rewritten at § Design gate
2026-10-25, is the design Build implements, and the intent moves `review → approved`.** This is
bet 3, which the roadmap conditions everything else on. It is the one result no other intent can
produce, and no shipped intent delivers it. Dropping it would drop the project's most important
measurement, so it is kept.

**What re-grounding found.** Zero of six requirements are met, and there is still no adopter. Since
2026-09-09, three things have changed:

- **The design named a package that does not exist.** `commander-agent` was dropped, and A1
  already reads "a burgee-family package". The rewrite removes the last mentions from the design.
- **The first attempt has happened, and taught three things.** The U12 trial of 2026-10-08 ran
  `burgee migrate` on apify/mcpc and on mac-cleaner-cli, measure only.
  [D-20261008-migrate-u12-findings](./D-20261008-migrate-u12-findings.md) fixed what it found.
  First, `vi.mock('chalk')` was not rewritten, which broke 51 of mcpc's 1,261 tests. Second, the
  printed install command was unpinned. Third, the pitch matters: the family adds bytes per layer,
  so the honest claim is fewer packages and graded compatibility, not "lighter". The outside
  candidate is apify/mcpc#447, still unmerged (gap C3).
- **A6 owns the lone-layer adopter** for `burgee` U12 and `cli-foundation-stack` S5. The
  engineering half (each tarball installs alone) is held by
  `scripts/independence-install-lock.test.ts`.

**The design accepted.** Pick the target by the three filters. The target uses an incumbent
the family grades. It has an issue in `.sdlc/research/issues/` that a burgee-family package
answers. Its maintainer can review the diff in an evening. The ranked prospect list in
`.sdlc/research/dependents.md` is the input. Then A3 first: run `burgee migrate` on a fork,
prove the revert is one green commit, and only then open one working pull request that
discloses who wrote the layer. A2's report is written into `.sdlc/research/adoption/<target>.md`
by someone who did not build the layer. A5's B1 variant waits for a merged adoption.

**The criterion the agent cannot close.** A1 and A6 are events in someone else's repository, so
this intent can stay `approved` for a long time after its build is done. That is the honest
state. A merge cannot be scheduled, and D-20261009-burgee-u12-1-0 already took it out of every
release gate.

**Build scope, one batch:** choose and record the target, A3 revert-first on a fork, and the
pull request with its A2 report draft. The batch never pitches "lighter".
