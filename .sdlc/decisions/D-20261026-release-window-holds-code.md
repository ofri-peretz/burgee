---
id: D-20261026-release-window-holds-code
subject: 'The release window held version numbers, not code: #1253 published roundel 1.2.1, burgee 1.7.2 and seniority 1.1.1 as patches built from a main that held ten minor changesets for them. What does release-cadence R2 become, and what refuses the next one?'
taken: Taken
date: '2026-10-26'
superseded_by: —
---

**A fix to a package that has a held minor or major waits with it. A `Security:` change releases its package at once, held code and all. `release.yml` defers a fix version of a package `main` still holds a non-fix changeset for. R2 is restated to that, and R1 now holds in substance.**

**What happened.** The Version PR #1253 (merged 2026-10-26 04:51 UTC) released patches of three packages whose minors the window was holding. A release is built from `main`, and `main` already had the code those changesets describe:

| published | as | carries, from held minors |
| :-- | :-- | :-- |
| `roundel@1.2.1` (05:22 UTC) | patch | `./colorette`, `./kleur`, `./yoctocolors` subpaths (`npm view roundel@1.2.1 exports`; 1.2.0 has none of them) |
| `seniority@1.1.1` (05:24 UTC) | patch | `packageLayer` |
| `burgee@1.7.2` (05:26 UTC) | patch | agent-headroom, plugin-contract "check every layer", typed-positionals R4, commander-env, the colorette and kleur migrate rewrites |

R1 says no non-fix release reaches npm within 7 days of the previous one. Each of these is a non-fix release in substance, under a patch number, inside its window (roundel 1.2.0 was 6 days old, seniority 1.1.0 5.5 days, burgee 1.7.0 12 hours). It also breaks semver the other way: a `~1.2.0` user received three new entry points.

**Why the design missed it.** `release-window.qnt` modelled version numbers: a fix-only release "does not move the window" and carried nothing else. The plan split a Version PR into what may release and what waits, and R2 required the fix half to release "including when it shares a changeset or a Version PR with a held minor". Both are true of the version, and false of the build. The model's `safety` held because the model had no variable for the code on `main`.

**The rule now.**

1. `planWindow`: a package with a held non-fix entry has every entry held, its fixes included. A fix to any other package releases as before, also from a changeset it shares with a held one.
2. A pending `Security:` change opens its package: nothing pending for it is held, so the release takes the version its build deserves (a minor, if a minor's code is in it) and the window restarts from it. The intent's constraint is "Security fixes ship immediately", and the code on `main` cannot be left out of that release, so it ships under its true number.
3. `publishable` (`release.yml`): a fix version of a package that `.changeset/` on the release commit still names at minor or major, without `Security:`, is deferred, and so is a package that depends on it at that version. This is the check that would have refused #1253's three patches. Such a version never reaches npm; its fixes ship in the package's next release.
4. `release-window.qnt` gains `fixWaits` (this design) and the code on `main`: a fix-only release merged while a feature is pending carries it. `holdsVersionsNotCode` (the design before this) is violated, `safety` holds over `--max-steps=40 --max-samples=200000`, and `shippedNeverHoldsAFix` is violated, so the new rule does hold a fix. `unsplitHolds` now names a security fix that waits behind a held feature, since an ordinary fix waiting behind one is the shipped design.

**Rejected.**

- *Hold every fix while any package has a held minor.* Delays fixes to packages whose builds carry nothing held.
- *Release the held minor whenever a fix for its package is pending.* The window would then hold nothing: in the 30 days to 2026-10-18 every package shipped 8 to 20 fixes.
- *Release fixes from a maintenance branch cut at the last tag.* It makes a fix release carry only fix code, which is the right shape, but it needs a second release flow, cherry-picks and a second changelog line. Not for a one-maintainer repository yet.
- *Restate R1 to version numbers only.* That weakens the criterion to what the mechanism did, which is the move this decision exists to refuse.

**Cost.** A fix to a package with a held minor waits up to 7 days. On the intent's 30-day measure this helps: a fix resets `latest`, and the spec predicted the share would stay at 0 while fixes publish freely. The constraint the intent wrote, security first, is unchanged.

**What is not undone.** Nothing is unpublished or re-versioned (R8). roundel 1.2.1, seniority 1.1.1 and burgee 1.7.2 stay on npm. Their minors still release when the windows open: roundel 2026-10-27 05:27 UTC, seniority 2026-10-27 18:05 UTC, burgee 2026-11-01 17:05 UTC.

**Open.** `models.yml` checks the three counterexamples it lists. `holdsVersionsNotCode` and `shippedNeverHoldsAFix` are checked by hand until its loop names them, because a change under `.github/` runs the paid task evals on its PR: B-20261026-models-yml-holds-code-invariants.
