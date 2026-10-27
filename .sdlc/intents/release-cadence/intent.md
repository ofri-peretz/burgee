# Intent — a release pace a cautious adopter can follow, and semver that matches the incumbent's

**Status:** dropped (2026-10-27) · **Opened:** `2026-10-18` · **Owner:** `@ofri-peretz` · approved by
the owner 2026-10-18; built 2026-10-18

**Dropped 2026-10-27** → [`D-20261027-no-release-window`](../../decisions/D-20261027-no-release-window.md):
the owner removed the release window ("No release window, we should release all day long every
time we wish to release."). Every release now goes out when it merges, so the 7-day batch rule,
its model and the 30-day share it was measured by are gone. The changeset lock, criterion 1, stays
in force as `scripts/changeset-lock.mts` on every PR that adds a changeset. The sections below are
the record as it stood.

---

## What is wanted

Two things are true of every family package:

1. **A behaviour change ships as a major whenever the incumbent shipped the same change as a
   major.** A drop-in user who pins `^1` gets no change their incumbent would have made them opt
   into.
2. **Releases are batched**, so that on most days the `latest` version is old enough to pass a
   7-day release-age gate. A project with such a gate can install the current minor, not one five
   minors behind.

## Why now

Part C of [`adoption-barriers-2026-10.md`](../../research/adoption-barriers-2026-10.md) (raw data
in `adoption-barriers/trust.json`), barrier 5:

- **Pace.**
  - burgee went from 1.0.0 to 1.6.0 in 8.7 days; three minors landed on 2026-10-12.
  - It shipped 46 releases in 42 days, a median of 0.32 days between releases.
  - The family shipped 248 releases in 30 days.
  - commander shipped 3 in the last 365 days, yargs 4 and chalk 2.
- **Release-age gates.**
  - In the last 30 days, burgee's `latest` was at least 7 days old on **0** days, and at least 3
    days old on 3.9.
  - In the field trial, svgo's 7-day `minimumReleaseAge` refused `burgee@^1.6.0` outright. The
    newest version it would take was 1.1.0.
- **Minors that broke behaviour.**
  - burgee 1.5.0 makes a native command refuse surplus positionals (exit 2). commander made the
    same change in 13.0.0, a major.
  - flagstaff 1.2.0 throws on `#GGG`, as boxen 9 does. boxen made that change in 9.0.0, a major.
- **Trust.** burgee has one human author and no outside dependent. A maintainer judging "will this
  still be here, and will it break me" reads the release page first.

## Affected users and systems

- Every published package, the changesets flow, and `release.yml`.
- Any adopter with Renovate, Dependabot or pnpm release-age settings.

## Constraints

- **Security fixes ship immediately.** The batching never delays them.
- **Supply-chain posture unchanged.** Trusted publishing, provenance and pinned actions stay as
  they are.
- **No retroactive majors.** Published versions are not unpublished or re-versioned.

## Success criteria

- A changeset lock: a changeset whose summary matches a behaviour row that the incumbent's own
  changelog lists under a major cannot be a `minor` or a `patch`.
- Over a 30-day window after this lands, the share of days on which each package's `latest` is at
  least 7 days old is at or above a number this intent's spec sets. It is measured with the same
  script as Part C.

## Scope, decided here

- **The batch rule.** No non-fix release of a package within 7 days of its previous non-fix
  release. Fixes are exempt. Rejected: a fixed weekly train, which delays a release that has
  waited long enough already.
- **Lock, not review rule.** The semver criterion is a changeset lock, because a review rule is
  what let burgee 1.5.0 and flagstaff 1.2.0 ship as minors.

## Where the criteria stand — 2026-10-18

**Status raised from `draft` to `approved`, not `shipped`:** the mechanism is built, and one
criterion of the two can only be measured over the 30 days after it lands.

- **The changeset lock** — **met.** `node scripts/release-window.mts lock`, run on every PR that
  adds a changeset (`changesets-pr.yml` → `required`), refuses a `minor` or `patch` whose summary
  matches a row of `.sdlc/bands/incumbent-majors.json`. `scripts/release-window.test.ts` refuses
  burgee 1.5.0's and flagstaff 1.2.0's changesets, verbatim, at `minor` and `patch` and accepts
  them at `major`; across all 375 changesets ever added it flags those two and no other. The table
  is minimal and its gap is stated in it and in [`spec.md`](./spec.md).
- **`latest` at least 7 days old on at least 50% of days, per package, over 30 days** — **not yet
  measurable.** The window (no non-fix release within 7 days of the previous one; fixes and
  `Security:` changes immediate) runs in `changesets-pr.yml` and `release.yml`, modelled in
  `release-window.qnt` (retired 2026-10-27). Measure with `node scripts/release-window.mts
  measure --from <merge time> --to <merge time + 30 days>`: the window closes on the 30th day after
  this merges (2026-11-18 if it merges 2026-10-19). The spec records the prediction: the window
  alone would not have moved the last 30 days' share off 0, because fixes reset `latest`. Raise to
  `shipped` only if the measured share meets 50% for every package; otherwise the Maintain stage
  writes the shortfall back as a new intent.

## Where the criteria stand — 2026-10-26

**Still `approved`, and not stamped: the window was breached in substance.** #1253 published
`roundel@1.2.1`, `seniority@1.1.1` and `burgee@1.7.2` as patches built from a `main` that already
had the code of ten minor changesets the window was holding for them. The version numbers waited;
the code did not. D-20261026-release-window-holds-code restates R2 (a held package's fixes wait
with it; `Security:` releases it at once) and widens R6 (`release.yml` defers such a patch). The
lock that would have refused #1253 is in `scripts/release-window.test.ts`, red on `main` first;
see [`spec.md` § Status 2026-10-26](./spec.md#status-2026-10-26). The model's two new
counterexamples, `holdsVersionsNotCode` and `shippedNeverHoldsAFix`, run in `models.yml` since
2026-10-27 (D-20261027-close-three-workflow-gaps), so neither is checked by hand any more.

- **The changeset lock** — met, unchanged.
- **The 30-day share** — not met yet. 0 of 7.19 days for every package from #1124's merge to
  2026-10-26. It is read over the 30 days after the fix above merges; with a merge on 2026-10-27
  that reading is due 2026-11-26. Raise to `shipped` only if each package's share is at least 50%;
  otherwise the Maintain stage writes the shortfall back as a new intent.

## Open questions

None.
