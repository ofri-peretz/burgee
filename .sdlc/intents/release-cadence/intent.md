# Intent — a release pace a cautious adopter can follow, and semver that matches the incumbent's

**Status:** draft · **Opened:** `2026-10-18` · **Owner:** `@ofri-peretz`

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

## Open questions

None.
