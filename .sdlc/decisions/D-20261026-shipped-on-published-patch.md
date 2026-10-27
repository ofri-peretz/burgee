---
id: D-20261026-shipped-on-published-patch
subject: 'Four intents were held at `approved` for "the burgee minor" or "the roundel minor", but Version PR #1253 already published their code as patches. Are they stamped `shipped` now, or after the minor bump?'
taken: 'Taken by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-26'
date: '2026-10-26'
superseded_by: —
---

**Stamp them now. `colour-facades`, `typed-positionals`, `agent-headroom` and `commander-env` are
`shipped`, each stamped against the published tarball. The minor bump that follows is bookkeeping.
It changes the version number and the changelog. It does not change the code anyone installs.**

**What happened.** The release window (`scripts/release-window.mts`, `release-cadence` R1) holds a
minor changeset's version bump. Version PR #1253 published `burgee@1.7.2`, `roundel@1.2.1` and
`seniority@1.1.1` on 2026-10-26 as patches. It built them from `main` at `c4230e33` (the `gitHead`
`npm view` reports for all three), and that `main` already carried the held features: PRs #1233
and #1255 (roundel's colorette and kleur subpaths), #1252 (commander-env V2 and K3), #1262
(typed-positionals R4), #1264 (seniority's `packageLayer`) and #1266 (agent-headroom). The
window held the version number back. It did not hold the code back.

**Why `shipped` follows the published code, not the version.** This program defines `shipped`
as "the criteria hold on published code". That rule exists so an intent is not stamped on `main`
before users can install it. The rule is met here: each criterion was re-run against
`npm i <pkg>@<exact version>` in an empty directory, not against the workspace. The evidence tables
are in each intent's status section. Waiting for the minor would stamp the same bytes a week later
under a different number. That would record when the version changed, not when the feature
reached users.

**What this does not decide.**

- **It does not excuse the breach.** Features the window should have held went out inside the
  window. That is `release-cadence`'s defect: its R1 says no non-fix release reaches npm inside the
  window, and in substance one did. Fixing the enforcement belongs to
  [`release-cadence`](../intents/release-cadence/intent.md), which another batch owns. This decision
  does not stamp or restate that intent.
- **It does not stamp an intent with a criterion still open.** `plugin-contract` C1–C3 hold on
  the published tarballs, but C4, the weekly U9 eval, has no executed reading since 2026-10-09.
  It stays `approved` until the 2026-10-29 scheduled run executes and passes. `seniority` is
  read in #1280's umbrella sweep: criterion 4's spawn and discovery-chain rows are not yet on
  `/docs/benchmarks`, so it stays open there.
- **The minor changesets stay on `main`.** When the window opens, the Version PR still bumps the
  minors and writes the changelog entries for these APIs. No intent waits on it.
