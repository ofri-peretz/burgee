---
id: D-20261029-release-waits-not-skips
subject: 'A release run on a commit superseded on main waits for that commit''s own gates and publishes when they pass; it is skipped only when one of its gates was cancelled, and a failed gate still refuses'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets, gates and trade-offs'
date: '2026-10-29'
superseded_by: —
---

**`release.yml`'s verify job ("Required checks passed on this commit") no longer skips a commit
just because it was superseded on `main` while its gates were still missing or pending. It keeps
polling until `Quality Gate` and `Quality (Full) Gate` settle on that commit, within the existing
45-minute deadline (`timeout-minutes: 50`). If they pass, it sets `ok=true` and the commit publishes.
It skips (`ok=false`, exit 0) only when a gate was cancelled: either the gate's check run concluded
`cancelled`, or a run of the gate's own workflow (`quality.yml`, `quality-full.yml`) on the commit
was cancelled before that check run existed. A failed gate still refuses, as before.**

## What happened

On 2026-10-29 release run **40823297761** on `37cefdfa` found `burgee: 1.9.2 → 1.9.3`, and verify
logged `37cefdfa… was superseded by a535a6e3… while its gates were unsettled (cancelled: none; still
missing or pending: Quality Gate (queued); Quality (Full) Gate (missing); 2 workflow run(s)
cancelled)`. Publish was skipped. The two cancelled runs were *Completions · four shells* and *Auto
Deploy on Main*, not gates. Both gates on `37cefdfa` passed: Quality at 05:38Z and Quality (Full) at
05:59Z, about 26 minutes after verify gave up. Run 40822748396 on the Version PR's own merge,
`21a4c2f1` (05:19Z), had skipped the same 1.9.3 the same way two minutes after it started, with one
non-gate run cancelled. burgee 1.9.3 reached npm at 06:06Z only because `a535a6e3` happened to stay
the head of `main` until its gates passed at 05:59Z, 47 minutes after the Version PR merged. Bot PRs
(bench-series observations, Version PRs) merge every 20 to 30 minutes, and Quality (Full) took 28 to
40 minutes on the nine completed pushes to `main` from `ca6814dd` to `a535a6e3`. A release therefore
published only when a quiet gap on `main` was longer than a Quality (Full) run, and nothing
guaranteed one.

The earlier run, **40698972302** on `608d16be` (2026-10-28), shows the shape before #1364: its
`quality.yml`, `quality-full.yml` and `compat.yml` runs had all really been cancelled by the next
push. That case is still a skip under this decision, and since #1364 it no longer happens on a push.

## Why the skip existed, and why it is now wrong

The skip was added in #994 (a gate that failed because its jobs were cancelled) and extended
in #1160 (a gate that is missing because its workflow was cancelled, run 39247745837 on `1b0ea782`).
No decision file recorded either. Both PRs left the rule in `scripts/release-verify-lock.test.ts`.
At that time a push to `main` cancelled the previous commit's `quality`, `quality-full` and `compat`
runs through shared concurrency groups, so a superseded commit's gates would never finish, and
waiting for them only burned the deadline.

**#1364** (`8299218e`) gave a push to `main` a concurrency group of its own in `quality.yml`,
`quality-full.yml` and `compat.yml`, as `codeql.yml` already had, with
`cancel-in-progress: ${{ github.event_name == 'pull_request' }}`. An older commit's gates now finish.
The skip's premise is gone. What was left was a check that counted *any* cancelled workflow run on
the commit, and other workflows (Completions, Auto Deploy) are still cancelled by newer pushes. That
check turned their cancellations into a skip of a release whose own gates were about to pass.

This supersedes the part of the #994/#1160 rule held by `release-verify-lock` that skipped a
superseded commit with pending gates whenever *any* workflow run on it was cancelled. These parts
are kept:

- A superseded commit whose gate **was cancelled** is skipped, not painted red. This still covers any
  run #1364 did not stop cancelling, such as a `workflow_dispatch` run of a gate waiting in the
  shared non-push group.
- A superseded commit whose gate **failed** after cancelled jobs is skipped (#994). A gate failure
  with nothing cancelled is refused.
- On the head of `main` nothing is skipped. A cancelled gate there is refused, so someone re-runs it.

## Why publishing an older commit is safe

The detect step plans only versions that npm lacks (`semver.gt(local, npm)`), and versions on
`main` only go up. If the older commit publishes, the newer commit's run publishes anything newer
than that, or finds nothing left to do. `release.yml`'s `release-workflow` concurrency group
(`cancel-in-progress: false`) runs releases one at a time. While an older run waits, the newest
pending run queues behind it, and its own gates have usually settled by the time it starts. This
matches [D-20261027-no-release-window](./D-20261027-no-release-window.md): a version on `main` that
npm lacks goes out on the next release run.

The verify job gains `actions: read`, because it now reads the gate workflows' runs by workflow file.
The repository-wide runs query it replaces worked without that permission only because the
repository is public.

## Unchanged

The dry-run input, OIDC trusted publishing (D-154), the dependency-ordered publish loop, the
45-minute deadline, and the oxmutate native-cores rows.

## Evidence

`scripts/release-verify-lock.test.ts` runs the verify step under `bash` with `gh` stubbed. The stub
can now report a sequence of states per poll. Three new cases failed on `main`'s step and pass after
the change:

- `publishes a superseded commit once its own gates pass, though other workflows on it were
  cancelled` (the `37cefdfa` shape: `expected 'ok=false\n' to contain 'ok=true'`).
- `refuses a superseded commit whose gate fails after it was waited on` (`expected +0 to be 1`).
- `keeps waiting on a superseded commit whose only cancelled runs belong to other workflows`
  (`expected +0 to be 1`).

The cancelled-gate skip cases stay green on both sides, including a new one where a gate is cancelled
after being waited on.

## Rejected

- **A longer deadline instead.** It would not help: the skip fired on the first poll, not at the
  deadline.
- **Dropping the cancelled-workflow-run check.** Run 39247745837's shape, a gate workflow cancelled
  before its `Gate` job existed, would then wait out 45 minutes and go red. The check is narrowed to
  the gates' own workflows rather than removed.
