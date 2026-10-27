---
id: D-20261027-no-release-window
subject: 'No release window: every release goes out when it merges. The 7-day window between non-fix releases of a package is removed, release-cadence is dropped, and the changeset lock stays'
taken: 'Taken — by the owner, 2026-10-27'
date: '2026-10-27'
superseded_by: —
---

**There is no release window. A changeset merged to `main` goes into the next Version PR, and a
version `main` holds that npm does not publishes on the next release run, whatever its bump and
however recently its package last released.**

The owner, 2026-10-27, verbatim: "No release window, we should release all day long every time we
wish to release."

**What is removed.**

- `release-cadence` R1–R5, the window. Since 2026-10-18 (#1124) a minor or major merged within 7
  days of its package's previous one was held on `main`. From 2026-10-26
  ([D-20261026-release-window-holds-code](./D-20261026-release-window-holds-code.md)) every fix to
  that package was held with it. That decision is superseded: with nothing held, there is no held
  code for a patch to carry.
- `changesets-pr.yml`: the steps "Plan the release window" and "Close a Version PR the window now
  holds entirely", the condition on "Open / refresh Version PR", and the daily schedule. The
  `version-script` is `npm run changeset:version` again, which `scripts/release-window.mts version`
  only wrapped. `version-script-converges-lock.test.ts` still holds that script's steps.
- `release.yml`: the `publishable` filter between the npm diff and the plan, and its daily
  schedule. Neither schedule had a job left once the window was gone.
- `scripts/release-window.mts` `plan`, `version`, `publishable` and `measure`, with their tests.
  `measure` computed the intent's 30-day criterion, the share of days `latest` passes a 7-day
  release-age gate. With the intent dropped nothing reads it, and it stays in git history.
- `.sdlc/intents/release-cadence/release-window.qnt` and the models.yml step that kept its
  rejected designs failing. The model proved properties of the window, and without the window it
  has nothing to model. Retiring it is honest. Keeping it with a zero-day window would check a
  `safety` that holds trivially.

**What stays.** The changeset lock: a changeset whose summary matches a behaviour an incumbent
shipped as a major (`.sdlc/bands/incumbent-majors.json`) cannot be `minor` or `patch`. It is
semver honesty, not cadence. It moved to `scripts/changeset-lock.mts`, and `changesets-pr.yml`
still runs it on every PR that adds a changeset.

**What we accept.** Part C of `adoption-barriers-2026-10.md` still stands: a project with a 7-day
`minimumReleaseAge` cannot install a package's newest release while it is under 7 days old. That
adopter installs an older one.

**Checks.** `scripts/no-release-window-lock.test.ts` fails on `main` before this change on all
four of its cases:

- the Version PR runs `npm run changeset:version` with no condition and no plan;
- `release.yml`'s plan is the npm diff, unfiltered;
- neither workflow has a schedule;
- the lock step runs `node scripts/changeset-lock.mts`.

**Intent.** [`release-cadence`](../intents/release-cadence/intent.md) is dropped by this decision.
