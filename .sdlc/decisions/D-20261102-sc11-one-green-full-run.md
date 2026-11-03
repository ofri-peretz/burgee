---
id: D-20261102-sc11-one-green-full-run
subject: 'oxmutate SC11 reads as one green full run, not a calendar week'
taken: 'Taken by the owner, 2026-11-02 ("I don''t need to wait. remove the ''one week''")'
date: '2026-11-02'
superseded_by: —
---

**SC11 no longer waits on the calendar.** `D-20261101-oxmutate-s3-fixture-sc11-week` read SC11 as
one green week starting at the first green weekly run, which put the earliest close at 2026-11-14
for no reason but elapsed time. The owner removed the week.

**What SC11 now requires.** One complete `npm run mutation:weekly` run on `origin/main`, engine
oxmutate, over every package in `.sdlc/bands/mutation-ratchets.json`:

- it exits 0: no package failed, no floor breached, and the `NIGHTLY_ONLY` cases it runs first are
  green;
- it records every package's observation in `mutation-ratchets.json` with the same schema, and that
  ratchet PR merges;
- every PR merged to `main` while the run was in flight passed its pre-push changed-lines lane.

The run may be started by hand (`launchctl kickstart gui/$(id -u)/dev.burgee.mutation-weekly`)
rather than waiting for Saturday's 02:30 start. A red run does not count, and the next green one
does. The Stryker engine is removed from the weekly script only after that green run, as SC11
always said.

**What stays.** The run is local, per `D-20261101-no-mutation-in-gha`. It is measured on the
owner's machine, and the result names the commit it measured.
