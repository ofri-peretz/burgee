---
id: D-20261018-drop-compat-grader-layer
subject: 'compat-grader-layer: its trigger is fixed, and publishing the grader contradicts compat-oracle''s accepted design'
taken: 'Taken — on the owner''s delegation of 2026-10-12, applied by the roadmap-to-shipped program of 2026-10-18'
date: '2026-10-18'
superseded_by: —
---

**Dropped. The defect that opened it is fixed another way, and the rest of it reverses an accepted design.**

The intent was opened on 2026-09-14 off empty `chore(release): version packages` PRs. Four
changesets targeted `compat-oracle`, which is `"private": true`, while `.changeset/config.json`
set `privatePackages: { version: false }`. The Version PR therefore had changesets to consume and
nothing it was allowed to version. The intent's answer was to rename the grader and publish it as
a layer.

**The trigger is fixed.** `.changeset/config.json` now sets `"privatePackages": { "version": true, "tag": false }`,
so a changeset for `compat-oracle` is consumed by a version bump that is never tagged or published.
`scripts/changeset-reachable-lock.test.ts` fails any changeset that names a package changesets will
not version, whether it is listed in `ignore` or private with `privatePackages.version` off. That is
the queue-never-empties shape, held by a check.

**The rest contradicts an accepted design.** compat-oracle's intent says
"`@interlace/compat-oracle` (internal, never published)". That intent is `approved`. Publishing
the grader would make its vendored incumbent suites, its baselines and its CLI a public API with
a semver promise. The intent never designed that, and it has no `spec.md`.

**What covers it instead.** `changeset-reachable-lock.test.ts` and `privatePackages.version: true`
for the release queue. compat-oracle, unpublished, for the grading.

**How to reopen.** If someone outside this repository wants to grade their own drop-in against
an incumbent's suite, write a new intent with an adopter named. First amend compat-oracle's
"internal, never published" constraint, with its own decision.
