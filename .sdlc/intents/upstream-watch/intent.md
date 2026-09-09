# Intent — Every package watches its own competitors, and the issue carries the changeset

> Stage 1 artifact. Child of [`compat-oracle`](../compat-oracle/intent.md) C6 and of
> [`cli-output-stack`](../cli-output-stack/intent.md) U5 and U11. Extends the daily upstream
> watch from *the five hosts we vendor a test suite for* to *every competitor a package
> names* — and makes the issue it opens say what we should do, not only what they did.

**Status:** draft · **Opened:** 2026-09-08 · **Owner:** @ofri-peretz

---

## What is wanted

Every published package declares the packages it competes with. A scheduled job fingerprints
each competitor's latest release, diffs it against the fingerprint we hold, and — when
anything moved — opens **one issue per (competitor, version)** carrying:

1. **what changed** — API names added, removed and renamed; exported types; the per-file
   content hashes that moved;
2. **what it costs us** — which of our subpaths claims parity or a weight ceiling against
   that package, and whether the claim is now stale;
3. **what our change should be** — the affected files, the bump level, and **the
   `.changeset/*.md` body, written out, ready to paste into the PR that implements it.**

(3) is the part that does not exist anywhere today, and it is the reason to build this
rather than widen the existing watch: an issue that says "commander added
`.helpCommand()`" is a research task. An issue that says *"`burgee/commander` is missing
`.helpCommand()`; add it to `packages/burgee/src/commander/program.ts`; here is the
changeset, `'burgee': minor`"* is a PR somebody — or an agent — can open in one turn.

## What already exists, honestly

Most of the machinery is built. This intent is a widening and a completion, not a new
system, and it should not be planned as though the ground were empty:

| Piece | Where | State |
| :-- | :-- | :-- |
| Per-file `sha256`, test names, API surface names | `compat-oracle/src/upstream.ts` — `CompatRecord` | shipped |
| Two records diffed into added/removed/changed | `diffRecords()` | shipped |
| Daily cron, one issue per (host, version), never duplicated | `.github/workflows/compat-upstream.yml` | shipped |
| The record committed per host | `vendor/<host>/.source.json` | shipped |

## What is missing

**1. Coverage stops at five.** `active()` filters `hosts.ts` to `status: 'active'` —
commander, yargs, chalk, ora, log-update. Eight declared hosts are `planned` and get no
watch at all, including boxen and cli-table3, which `flagstaff/box` and `flagstaff/table`
already compete with, and clack and inquirer, which caique does.

**2. Weight competitors are not hosts at all.** The packages we cite in published numbers —
picocolors, string-width, wrap-ansi, cli-spinners, cli-boxes, slice-ansi, signal-exit — are
not in `hosts.ts` because we grade no suite against them. They are exactly where the claim
rots quietly: "roundel ships under picocolors' weight" is a number in a README and a bet in
the roadmap's minimum, and picocolors can publish a release that changes it without a single
test of ours going red.

**3. A competitor watch needs a git clone.** `checkUpstream()` clones the repo into a scratch
directory to fingerprint it. That is right for a *suite* — we need the tests — and wrong for
a *surface*: the published tarball has the `.d.ts` and the entry point, which is all an API
diff and a weight number need, and it is what a user actually installs. A competitor with no
public repo, or a repo whose layout we do not know, is watchable from npm alone.

**4. The issue stops at the diff.** It says what upstream did. It does not say which of our
files are affected, what bump that implies, or what the changeset should read.

## Affected users and systems

- Every published package: a declared competitor list, and a held fingerprint per competitor.
- `packages/compat-oracle`: the fingerprint and diff code is reused, not reimplemented; the
  npm-tarball path is new.
- `.github/workflows/`: the daily job widens; the issue body gains the "what we should do"
  half. Issues are opened, never PRs — a version bump is not a change we make unattended.
- `apps/docs`: a stale weight or parity claim is visible on the scoreboard rather than only
  in an issue.

## Why now

- Four packages are published and make **numbers** as claims — 1,361/1,361, 99/99,
  55,641 B against 113,577. A published number that nobody rechecks is a number that becomes
  false without an event. The watch is what turns each claim into something with a
  maintenance band behind it.
- The roadmap's maintenance bands already promise **seven days to track an upstream
  release**. That band is only measurable for the five hosts with a vendored suite; for
  everything else there is no signal to start the clock.
- U9 says an agent should be able to do this work in one turn. The issue is the prompt. An
  issue that ends in a ready changeset is a one-turn task; one that ends in a diff is not.

## Constraints

1. **Read-only against upstream.** Fingerprinting downloads a published tarball and reads
   it. Nothing is executed, no `postinstall` runs, nothing is written under `vendor/`.
2. **Issues, never PRs.** The watch reports; a human or an agent opens the PR. An automated
   PR against a competitor's release is a change nobody reviewed at the moment it mattered.
3. **One issue per (competitor, version).** Re-running the job must not reopen or duplicate;
   the existing dedupe is the behaviour to keep.
4. **No new runtime dependency**, in any package. This lives in `compat-oracle` (private)
   and in scripts.
5. **A competitor list is data a package owns**, not a central table. A package that is
   deleted takes its competitors with it, and a new subpath that replaces something declares
   what it replaced, in the same PR.
6. **The proposed changeset is a proposal.** It is rendered into the issue as a fenced block
   and is never written to `.changeset/` by a machine.

## Success criteria

- Every published package declares at least one competitor, and a lock fails when a subpath
  that names an incumbent in its weight rule has no competitor entry for it.
- The watch covers **every** declared competitor, including those with no vendored suite —
  at least: commander, yargs, chalk, picocolors, ora, log-update, boxen, cli-table3, clack,
  inquirer, string-width, wrap-ansi, cli-spinners, cli-boxes.
- A competitor releasing a version with an added export produces an issue naming that
  export, the subpath that claims parity, and a changeset block with the right bump level.
- A competitor releasing a version that changes its weight produces an issue naming the
  README line and the weight-lock comment that now state a stale number.
- The dedupe holds: running the job twice on the same day opens no second issue.
- Proven by a fixture, not by waiting: a recorded "old" fingerprint and a recorded "new" one
  produce a known issue body, asserted byte-for-byte.

## Open questions

- **Where the fingerprint lives.** Proposed: `packages/<pkg>/competitors.json`, one file per
  package, holding the declaration *and* the last-seen fingerprint, so the diff is a git
  diff and a human can see what moved in a PR. The alternative — a central
  `.sdlc/bands/competitors.json` — is one file to lock but breaks constraint 5.
- **Whether the surface diff should read `.d.ts` or the entry's exports.** Proposed: both,
  with `.d.ts` preferred when present, since a type-only addition is a real API addition and
  is invisible to a runtime export scan.
- **Whether a stale weight claim should fail CI or only open an issue.** Proposed: open an
  issue. A competitor getting heavier is not our regression, and a red build we cannot fix
  by changing our own code is a broken feedback loop.
- **Whether `hosts.ts` and `competitors.json` merge.** Proposed: no. A host is something we
  run a *test suite* from and needs a repo, a runner and a shim; a competitor is something we
  measure a *surface* against and needs only a name. Every host is a competitor; most
  competitors are not hosts.
