# Design — a release pace a cautious adopter can follow, and semver that matches the incumbent's

Intent: [`intent.md`](./intent.md). **Status:** dropped 2026-10-27 by
[`D-20261027-no-release-window`](../../decisions/D-20261027-no-release-window.md): the owner removed
the release window. R1–R9 no longer hold anything; the changeset lock (R6's table, now
`scripts/changeset-lock.mts`) stays. The design below is the record as it stood (intent approved by
the owner 2026-10-18; design acceptance delegated for batch 1 of the roadmap-to-shipped program).

---

## Requirements

- **R1 — the window.** No non-fix release (`x.y.0`: a minor or a major) of a package reaches npm
  within 7 days of that package's previous non-fix release.
- **R2 — fixes are never delayed by another package's window.** ~~A `patch` changeset, or any
  changeset whose summary opens with `Security:`, releases on the next Version PR whatever any
  window says, including when it shares a changeset or a Version PR with a held minor.~~
  **Restated 2026-10-26** (D-20261026-release-window-holds-code): a release is built from `main`,
  so a patch of a package with a held minor carried that minor's code (#1253). Now a fix to a
  package with a held non-fix changeset waits with it; a fix to any other package releases on the
  next Version PR, also from a changeset it shares with a held one. A `Security:` change is never
  delayed: it releases its package at once with everything held for it, so the version says what
  the build carries.
- **R3 — held, not lost.** A held changeset stays on `main` and releases on the first run whose
  window is open: every push to `main`, and a daily schedule when nothing is pushed.
- **R4 — a release in flight counts.** A non-fix version on `main`'s manifest that npm does not
  have yet closes the window, so a second minor cannot follow the first while it publishes.
- **R5 — fail closed for features, never for fixes.** A registry that does not answer holds a
  minor and never a fix.
- **R6 — backstop.** `release.yml` does not publish an in-window non-fix version that reached
  `main` some other way (a Version PR merged by hand), unless its changelog section has a
  `Security:` entry; a package that depends on it at that version waits with it.
  **Widened 2026-10-26:** nor a fix version of a package that `.changeset/` on the release
  commit still names at minor or major (without `Security:`), because that build carries the held
  code. This is the check that refuses #1253's three patches.
- **R7 — the changeset lock.** A changeset whose summary matches a behaviour row the incumbent
  listed under a major (`.sdlc/bands/incumbent-majors.json`) cannot be `minor` or `patch` for a
  package that drops that incumbent in. It runs on every PR that adds a changeset.
- **R8 — unchanged.** Trusted publishing, provenance, pinned actions and the publish order are
  untouched; no published version is re-versioned.
- **R9 — the measure.** `node scripts/release-window.mts measure` computes Part C's figure: the
  days in a window on which each package's `latest` was at least N days old.

## Design

One script, `scripts/release-window.mts` (plain Node, builtins only, as `release-order.mts`):

| command | where | what |
| :-- | :-- | :-- |
| `plan --out F` | `changesets-pr.yml`, before the Version PR refresh | reads `.changeset/*.md` and each named package's npm `time`, and decides per changeset entry: release now or hold. Writes `releasable` and `held` as step outputs and the held list, with the date each window opens, to the run summary |
| `version` | the changesets action's `version-script` | runs `npm run changeset:version` with each wholly held changeset moved aside and each split one cut to its releasable half, then writes the held halves back. The Version PR branch therefore carries everything releasable, plus each split file reduced to its held half, so the held entries stay on `main` |
| `publishable --out F` | `release.yml` `detect` | filters the plan before it is emitted (R6) |
| `lock` | `changesets-pr.yml` `required`, on PRs with a changeset | R7 |
| `measure` | by hand, for the 30-day criterion | R9 |

`changesets-pr.yml`'s version job also runs on a daily `schedule` (R3). When nothing pending is
releasable and something is held, it does not run the changesets action (a version run with no
changes cannot open a PR) and closes a Version PR left open, if any. The Version PR it does open
holds only what may release, so the existing auto-merge step needs no new condition: the
directive "auto-merge only when every package it publishes at minor/major is out of its window,
or it holds only fixes" is met by construction, and a fix is never what waits.

`release.yml` gains the same daily schedule, so a version R6 deferred publishes once its window
opens. Every other day `detect` finds npm level with `main` and the run ends there. Its build job
change (full history and tags) belongs to `migrate-pins-carry-the-drop-in`.

The lock reads phrases, not patterns: lower case, backticks removed, a string anywhere in the
summary or a list of phrases inside one sentence. The table is data an agent edits, and nothing
builds a regular expression from it.

**The table, and its gap.** The repository had no curated list of incumbent behaviour changes by
major, only `trust.json`'s `incumbent_breaking_changes` (commander, yargs, and the ESM-only and
Node-floor majors of chalk, ora, boxen, meow and inquirer) and the two minors that broke
behaviour. So the table is minimal: commander 12, 13 and 15, yargs 18, boxen 9, and two `*` rows
for the changes every incumbent ships as a major (a raised Node floor, dropping `require()`).
**The other graded incumbents have no behaviour rows** — chalk's colour levels, ora, log-update,
cli-table3, picocolors, the prompt libraries, ink, the config loaders and the process utilities.
A drop-in following one of their majors needs a row first. Measured against every changeset ever
added here (375), the table flags exactly the two known breaking minors and nothing else.

### The model

`release-window.qnt` models one package: changesets landing (fix or feature), the Version PR
refresh, auto-merge, the release reaching npm later, and time passing a day to a week at a
step. Two design choices are picked at `init`, so one simulation walks both sides:

- `split` — set a held feature aside and release the rest. The alternative, holding the whole
  Version PR while any feature is in its window, is the shape the program's directive first
  described ("otherwise it stays open"). `unsplitHolds` is the counterexample: a fix pending
  beside a held feature waits up to a week. That is why `version` splits.
- `readsManifest` — R4. `npmOnlyHolds` is the counterexample: feature one merges, a feature lands
  before npm has it, the refresh reads npm alone and finds the window open, and two minors publish
  the same day.

`safety` (the shipped design keeps the window and never delays a fix) holds over
`--max-steps=30 --max-samples=20000`. `models.yml` also checks that `unsplitHolds`,
`npmOnlyHolds`, `holdsVersionsNotCode` and the non-vacuity witnesses
`shippedNeverReleasesAFeature` and `shippedNeverHoldsAFix` stay violated, so a model that stopped
telling the designs apart, never shipped a feature or never held a fix, goes red.
`scripts/release-window.test.ts` › "models.yml keeps the model’s rejected designs failing" fails
if the loop names any other set.

### The 30-day target

**Each published package's `latest` is at least 7 days old on at least 50% of the 30 days after
this merges** (15 days of 30), measured with `node scripts/release-window.mts measure --from
<merge time> --to <merge time + 30 days> --age 7`. The figure is the intent's own wording, "on
most days": a 7-day gate should let a cautious adopter take the current release more often than
not.

The measure reproduces Part C: for 2026-09-18T17:00Z to 2026-10-18T17:00Z it gives burgee 0 days at
7 and 3.98 days at 3 (Part C reported 0 and 3.9).

**The prediction, stated before the window runs.** Replaying the last 30 days of every package's
npm history under R1 — every `x.y.0` pushed to at least 7 days after the previous one, every fix
where it was — moves the share for 9 of 10 packages from 0.0 to 0.0, and controlroom's from 0.04
to 0.04. The reason is R2: each package shipped 8 to 20 fixes in those 30 days, and every fix
resets `latest`. So the window alone does not reach 50%; the target is met only if the fix stream
slows too. That is the honest test of the intent: if it misses, the Maintain stage writes back an
intent that narrows what publishes as a fix (a docs-only change that ships no code, which most of
those patches were, need not publish at all). The target is not lowered to what the mechanism
already achieves, because then it would measure nothing.

## Verification

- `npx vitest run --config vitest.root.config.ts scripts/release-window.test.ts`: parsing, what
  counts as a fix, the window at the millisecond, splitting, in-flight, registry failure, the
  version run (including a crash mid-run restoring every held file), the backstop, every lock row
  against a must-match and a must-not-match summary, the five near misses from history, the two
  historical changesets refused at minor and patch and accepted at major, Part C reproduced from
  burgee's real `time`, and the workflow steps. The workflow assertions failed (5 of 5) against
  `main`'s workflows; the rest import a module `main` did not have.
- `npx -y @informalsystems/quint@0.33.0 run .sdlc/intents/release-cadence/release-window.qnt
  --invariant=safety --max-steps=30 --max-samples=20000`: no violation. The same run with
  `unsplitHolds`, `npmOnlyHolds` and `shippedNeverReleasesAFeature`: each violated.
- `node scripts/release-window.mts lock` on this branch: 0 violations.

## Status 2026-10-26

**The window held version numbers, not code, and that is fixed here.** The Version PR #1253
published `roundel@1.2.1`, `seniority@1.1.1` and `burgee@1.7.2` as patches from a `main` holding
three, one and six of their minor changesets; `roundel@1.2.1` exports `./colorette`, `./kleur` and
`./yoctocolors`, which `1.2.0` does not. R1 was breached in substance three times while every
check passed. D-20261026-release-window-holds-code records the cause (the model had no variable
for the code on `main`) and the rule above.

| check | red on `main` (`8550bdbd6c`) | now |
| :-- | :-- | :-- |
| `scripts/release-window.test.ts` › "holds a patch for a package whose minor is held: main’s build of it carries the minor’s code" | the patch released (`['p.md', 1, 0]`), `releasable: true` | held, with its window's date |
| › "holds a fix behind its own package’s held minor only, and releases another package’s fix" | `roundel` patch released | held; `flagstaff` patch released |
| › "a Security: change releases its package with everything held for it, …" | the minor held | nothing held |
| › "defers a fix version while main holds an unreleased minor for the package, and what depends on it" | `roundel@1.2.1` and its dependent kept | both deferred |
| › "publishes that fix version when its changelog section carries a Security: entry" | — (no held set) | kept |
| › "publishable: reads the held minors from .changeset/, and a Security: or patch changeset holds nothing" | `roundel@1.2.1` kept | deferred, with the `::notice` |
| › "plan writes the whole summary" | the old sentence | the new one |

Stryker over the changed lines of `release-window.mts` (run by hand: the repository lane
mutates `packages/*/src` only): 70 mutants, 70 killed, 100%.

`release-window.qnt` gains `fixWaits` and the code on `main` (a fix-only release merged while a
feature is pending carries it). `safety` holds over `--max-steps=40 --max-samples=200000`;
`unsplitHolds`, `npmOnlyHolds`, `holdsVersionsNotCode`, `shippedNeverReleasesAFeature` and
`shippedNeverHoldsAFix` are each violated. ~~`models.yml` checks the first three and not yet the
two new ones: B-20261026-models-yml-holds-code-invariants.~~ **2026-10-27:** `models.yml`'s step
"release window — the rejected designs still fail, and the shipped one ships" checks all five
(D-20261027-close-three-workflow-gaps); the lock above, red on `b62bd20c86`, holds its list.

**The 30-day measurement.** `node scripts/release-window.mts measure --from 2026-10-19T02:06:25Z
--to 2026-10-26T06:40:00Z --age 7` reads 0 days of 7.19 for all ten packages: no package's
`latest` reached 7 days old in the first week after #1124. That window, as first written, closes
2026-11-18T02:06:25Z and its reading will be recorded. But for its first week the mechanism let
held code out, so the criterion is read over the 30 days after this fix merges, not the 30 after
the merge of #1124: shifting the window later measures the mechanism the intent asked for, and lowers nothing.

## Rejected alternatives

- **Hold the whole Version PR.** The model's `unsplitHolds`: it delays fixes, which the intent's
  constraints forbid.
- **A fixed weekly release train.** Rejected in the intent: it delays a release that has already
  waited long enough.
- **Read npm alone for the previous release.** `npmOnlyHolds`.
- **Gate in `release.yml` only.** A deferred version would sit on `main` with its changelog
  written and its dependents blocked; the Version PR is where a held change costs nothing.
- **Patterns in the lock table.** Runtime-built regular expressions from a data file are the
  ReDoS and injection shape this repository's own lint refuses; phrases are enough.
- **A review checklist for semver.** What let burgee 1.5.0 and flagstaff 1.2.0 ship as minors.

## Out of scope

- Narrowing the fix exemption (docs-only patches). The 30-day measurement decides whether it is
  needed.
- Behaviour rows for the incumbents listed under the gap above.
- Prerelease and pre-mode flows, which this repository does not use.
