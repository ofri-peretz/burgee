# Design — Every package watches its own competitors, and the issue carries the changeset

Intent: [`intent.md`](./intent.md). **Status:** draft — awaiting the Design→Build gate.

> Written 2026-09-08 against `packages/compat-oracle/src/upstream.ts` and
> `.github/workflows/compat-upstream.yml`, both of which already work. The fingerprint,
> the diff and the dedupe are reused as they stand. What is designed here is a second
> *source* for a fingerprint (an npm tarball rather than a git clone), a declaration each
> package owns, and the half of the issue that says what we should do about it.

---

## Requirements

- **R1 — A package declares its competitors.** `packages/<pkg>/competitors.json` lists, per
  subpath, the npm packages that subpath replaces or is measured against, and what kind of
  claim we make: `compat` (we are graded by its suite), `weight` (we cite a byte ceiling),
  or `surface` (we intend parity but grade nothing yet).
- **R2 — The declaration is checked against the locks that already state it.** A weight rule
  whose comment names an incumbent must have that incumbent in `competitors.json`. Prose and
  data cannot disagree, because one of them is generated from the other's absence.
- **R3 — A fingerprint comes from the published tarball.** `npm pack`-equivalent download,
  read-only: per-file `sha256`, exported names from the entry and from `.d.ts`, and the
  installed byte weight. No clone, no install, no lifecycle script.
- **R4 — Every declared competitor is watched**, whether or not it has a vendored suite.
  A host in `hosts.ts` keeps its richer clone-based fingerprint; everything else uses R3.
- **R5 — One issue per (competitor, version).** Idempotent: re-running opens nothing new.
- **R6 — The issue carries the proposed change.** Affected files, bump level, and the
  `.changeset/*.md` body as a fenced block, ready to paste.
- **R7 — The issue never becomes a PR, and never writes `.changeset/`.** The watch reports.
- **R8 — Proven by fixture.** A recorded before/after pair renders a known issue body,
  asserted in a test, so the rendering is verified without waiting for a real release.

## Design

### The declaration — `packages/<pkg>/competitors.json`

One file per package. It holds both the claim and the last-seen fingerprint, so a change
upstream shows up as a **git diff on a committed file** — reviewable, blameable, and
revertable — rather than as state in a workflow.

```jsonc
{
  "./ora": [
    {
      "package": "ora",
      "claim": "compat",          // graded by its own suite via compat-oracle
      "seen": {
        "version": "9.4.1",
        "weight": 113577,          // bytes, the whole resolved graph
        "surface": "sha256:…",     // hash of the sorted export list
        "exports": ["default", "oraPromise", "spinners"]
      }
    }
  ],
  "./log-update": [
    { "package": "log-update", "claim": "compat",  "seen": { "version": "8.0.0", "weight": 113368, … } },
    { "package": "wrap-ansi",  "claim": "weight",  "seen": { "version": "10.0.0", "weight": 20004, … } },
    { "package": "slice-ansi", "claim": "weight",  "seen": { "version": "8.0.0",  "weight": 27630, … } }
  ]
}
```

The subpath keys are the same strings `weight.test.ts` uses for its rules, which is what
makes R2 checkable: for every rule whose comment names a package, that package is in this
file under the same subpath.

**Why per package rather than one central file.** Intent constraint 5. A subpath's
competitors are part of what the subpath *is* — `./log-update` exists to replace sixteen
packages, and that fact belongs beside its budget, not in a table three directories away. It
also means a package deleted takes its watch with it, with no orphaned row to notice later.

### Two fingerprint sources, one diff

`upstream.ts` already produces a `CompatRecord` and `diffRecords()` already compares two of
them. Neither changes. What is added is a second way to *build* a record:

| Source | Used for | Gives |
| :-- | :-- | :-- |
| git clone (`vendor()`, exists) | the 5+ hosts with a vendored suite | test files, test names, surface names, hashes |
| npm tarball (`fromRegistry()`, new) | every competitor | file hashes, export names, `.d.ts` names, weight |

`fromRegistry(name, version)` downloads the tarball to a scratch directory, reads it, and
returns a `CompatRecord` with `tests: {}`. `diffRecords()` handles that already — an empty
`tests` map on both sides diffs to nothing, so the same function serves both without a flag.

**Why the tarball and not the repo.** Three reasons, in order of weight: it is what a user
installs, so the surface we diff is the surface that reaches them; it needs no knowledge of
a repo's layout, which is what today limits the watch to hosts we have hand-configured; and
it works for a package whose repo is gone, renamed, or monorepo-shaped. The cost is that a
tarball has no tests — which is why the clone path stays for the hosts that need it, rather
than being replaced.

**Reading it is read-only (constraint 1).** Download, extract, read. No `npm install`, so no
lifecycle script from a competitor's package ever runs in our CI. This is worth stating as a
design decision and not only a rule: the job runs on a schedule with `issues: write`, and a
`postinstall` from an upstream package would be executing untrusted code in a job that holds
a token.

### Weight, measured the way we already publish it

The weight number in `competitors.json` must be produced by the *same* method the README and
the weight locks use, or the comparison is theatre. That method is already written down in
`flagstaff/src/weight.test.ts`: shipped code and data — `.js`/`.mjs`/`.cjs` plus the `.json`
a module imports, `package.json` never counted — over the graph an import actually pulls,
with a competitor counted across its own resolved tree.

The watcher calls the same walker. If the two ever diverge, the published claim and the
watch disagree, and the watch is the one that will be believed.

### The issue body

Two halves, in this order, because the second is what makes the issue actionable:

```markdown
## ora 9.4.1 → 9.5.0

### What changed
| | |
| --- | --- |
| exports added | `oraStream` |
| exports removed | — |
| weight | 113,577 → 118,204 B (+4.1%) |
| files changed | 3 |

### What it costs us
`flagstaff/ora` claims `compat` against ora and is graded 99 / 99 by its suite.
`oraStream` is not implemented — the claim is now 99 / 99 of a suite that has moved.
`packages/flagstaff/src/weight.test.ts:75` states ora's weight as 113,577 B in a
published comparison; that line is stale.

### What our change should be
- [ ] `packages/flagstaff/src/ora.ts` — add `oraStream`
- [ ] `packages/flagstaff/src/ora.test.ts` — a case per new upstream test
- [ ] `packages/flagstaff/src/weight.test.ts:75` — the ora figure and the percentage
- [ ] `packages/flagstaff/README.md` — the same figure
- [ ] `packages/compat-oracle/vendor/ora/` — re-vendor at 9.5.0 (the weekly refresh PR)

```changeset
---
'flagstaff': minor
---

`flagstaff/ora` follows ora 9.5.0: adds `oraStream`.

Graded by ora 9.5.0's own suite. The weight comparison moves with it — ora is
118,204 B across seventeen packages; `flagstaff/ora` is unchanged at 46,543 B.
```
```

**How the bump level is decided**, rather than guessed: an added export on a package we
claim `compat` against is a `minor` for us (new surface to reach); a removed or renamed
export is a `major` risk and the issue says so rather than proposing a bump, because a
façade dropping a method is a decision, not a follow; a `weight`-only change is a `patch`
and touches numbers, not code. A `surface` claim with no grading proposes nothing beyond the
file list — we have not promised anything to break.

**The checklist is derived, not templated.** Each line comes from something already in the
tree: the subpath's source file from `exports`, its test file by convention, the weight-rule
line number by searching `weight.test.ts` for the competitor's name, the README line the
same way. A checklist item that cannot be derived is omitted rather than invented — an issue
that names a file that does not exist teaches people to skim the issue.

### Where it runs

`.github/workflows/compat-upstream.yml` keeps its cron and its dedupe and gains the
competitor pass. One job, two passes, one issue stream. A second workflow would double the
scheduled minutes and split the dedupe state, which is the one piece that must not be split.

### Order to do it in

1. **`competitors.json` for `flagstaff`, generated from what `weight.test.ts` already says**,
   plus the R2 lock. This is the step with a real chance of finding a claim already stale,
   and it needs nothing new to run.
2. **`fromRegistry()`** in compat-oracle, with the R8 fixture test.
3. **The issue renderer**, with the fixture asserting a known body. The renderer is pure —
   two records and a declaration in, markdown out — so it is testable without a network.
4. **Wire the second pass into the workflow**, and widen to roundel, caique and burgee.

Steps 1–3 are offline and land as ordinary PRs with tests. Only step 4 touches CI.

### What this ships as, in its own words

The changeset each step carries, so the release notes read as a capability rather than as
four unrelated commits. Step 1 and 2 are private-package work and carry none.

Step 3 — the renderer — is the first user-visible piece, and step 4 turns it on:

```markdown
---
'compat-oracle': minor
---

The upstream watch covers every declared competitor, not only the hosts with a vendored
suite, and its issue says what our change should be.

A package now declares its competitors per subpath in `competitors.json`, holding the claim
(`compat`, `weight` or `surface`) and the last-seen fingerprint — so an upstream release
shows up as a git diff on a committed file. Competitors without a vendored suite are
fingerprinted from the published tarball rather than a clone: read-only, no install, so no
upstream lifecycle script runs in a job that holds a token.

The daily issue gains a second half: which of our subpaths claims parity or a weight ceiling
against that package, which published numbers are now stale and where they are written, and
the `.changeset/*.md` body we should ship — with the bump level derived from the kind of
change (an added export is `minor`; a removed one is a decision, not a follow).
```

`compat-oracle` is private, so that changeset moves no published version; it is written
because the release notes are how the family records what it can now do, and because a
capability with no changeset is a capability nobody outside this file learns about.

## What shipped (step 1 — the declaration and its lock — 2026-09-08)

`packages/flagstaff/competitors.json` and `scripts/competitors-lock.test.ts`. The
declaration is per subpath, with the claim (`compat`, `weight`, `surface`) and the
last-seen fingerprint, so an upstream release will arrive as a git diff on a committed file.

**It found one immediately, which is why step 1 was ordered first.** flagstaff's README and
weight lock both publish ora's dependency bill as "113,577 B across seventeen packages", and
that bill itemises `chalk 16,727`. Nothing watched chalk from flagstaff. A chalk release
would have moved a number flagstaff publishes, and no test in the repo would have noticed —
which is the exact failure mode this intent exists for, found on the first package it was
applied to.

**R2 is file-level rather than per-subpath, on purpose.** Mapping a package name inside a
comment block back to the weight rule it belongs to means parsing comments, and that breaks
the first time somebody reflows a paragraph. Asking "is this competitor watched at all"
needs no parsing and catches the failure that actually happens. The names searched for come
from a `KNOWN` list, so an incidental mention in prose cannot fail a build — and adding a
competitor to that list is the moment somebody decides whether it is watched.

One refinement the first run forced: `roundel/chalk` is our own subpath, not a citation of
chalk, so the matcher requires the name not be preceded by `/`. The chalk finding survives
it — verified before the entry was added, not after.

A fifth assertion beyond R1 and R2, cheap and worth having: a `compat` claim must name a
host `compat-oracle` actually grades. A package claiming to be graded by a suite that does
not exist is a claim with nothing behind it.

Four mutations proved the suite bites: a cited competitor undeclared (1 red), a subpath that
is not exported (1), a claim the watch cannot make (1), and `compat` against a non-host (2).

**Extended the same day to roundel, caique and burgee**, which turned the file-level R2
heuristic from defensible into wrong and then into right. Applied to four packages it
produced six matches, and only two were citations: the others were an issue reference
(`clack #286`), a sentence about behaviour ("chalk and ora disagree about the same
terminal"), and two example values in a README code sample (`choices: [{ value: 'ora' }]`).

The rule that separates them: **a competitor is cited when its name sits on a line that also
carries a measured figure** — a comma-grouped byte count, a number with a byte unit, or a
version. Prose names a package; a claim puts a number next to it, and only a number goes
stale. Checked against all six matches, and the two real findings survive it, which was
verified by mutation rather than by reading.

It also draws a line worth naming. flagstaff itemises ora's bill per package
(`cli-spinners 27,841 · signal-exit 21,983 · chalk 16,727`), so each of those is an
independent figure and each needs a watch. burgee gives yargs' tree as one total
(`256,000 is what npm install yargs puts on disk`) and names `string-width` and `wrap-ansi`
only as parts of it — so watching **yargs** covers the claim, and those two need no entry of
their own. Per-package itemisation creates per-package claims; a total does not.

**A second hole, found by a mutation that failed to fail.** Deleting burgee's `yargs` entry
left the suite green, because `commander` and `yargs` were not on the `KNOWN` list — so
burgee's citations were checked against nothing and the engine's own numbers, the roadmap's
first bet, were unwatched while the lock reported green. Both are on the list now, and a
sixth assertion guards the direction that failure came from: every competitor a package
*declares* must be on `KNOWN`, so a declaration can never outrun the list that searches for
it.

Five mutations bite: flagstaff dropping chalk, roundel dropping picocolors, burgee dropping
yargs, burgee dropping commander, and a declaration `KNOWN` omits.

Not yet: `fromRegistry()` (step 2), the issue renderer (step 3), the workflow (step 4).

## Verification

The loop: `npm test && npm run lint`.

| Check | File | What it catches |
| :-- | :-- | :-- |
| R1/R2 — declaration matches the locks | `scripts/competitors-lock.test.ts` | a weight rule naming an incumbent with no `competitors.json` entry; an entry for a subpath that is not exported |
| R3 — the tarball fingerprint | `packages/compat-oracle/src/registry.test.ts` | over a committed fixture tarball, so no network |
| R6/R8 — the issue body | `packages/compat-oracle/src/issue.test.ts` | a before/after pair renders a known body, asserted byte-for-byte, including the changeset block |
| bump level | same | an added export proposing anything but `minor`; a removed export proposing a bump at all |
| R5 — dedupe | the existing workflow behaviour | unchanged, and that is deliberate |

**The check that would have caught the problem this intent names.** There is not one today,
which is the finding: `flagstaff/ora`'s weight comparison cites ora 9.4.1 at 113,577 B, and
nothing in the repo re-reads that number. The R2 lock plus step 1 turns every published
comparison into a row with a name attached, and the watch is what re-reads it. Until step 1
lands, the honest statement is that our published weight numbers are true as of the day they
were measured and unverified since.

## Rejected alternatives

- **Widening `hosts.ts` to cover every competitor.** A host carries a repo, a runner, a
  shim, an import map and a vendored suite — everything needed to *run someone's tests*. A
  competitor needs a name. Making picocolors a host would mean inventing a runner and a
  suite for a package we grade nothing against, to reach a field we do want. Two shapes,
  one diff function.
- **Opening a PR instead of an issue.** Tempting, and it is what "automatically" could mean.
  An automated PR against an upstream release is a change nobody reviewed at the moment it
  mattered, it would race the weekly re-vendor PR for the same files, and constraint 2 of
  the intent forbids it. The changeset in the issue is the same value with the human left in.
- **Writing the proposed changeset into `.changeset/` on a branch.** Same objection, plus a
  changeset for work not done breaks `changeset:status` for everyone until it is removed.
- **A central `.sdlc/bands/competitors.json`.** One file to lock, and it would work. It puts
  a subpath's competitors three directories from the subpath and leaves an orphan row when a
  package is deleted. The per-package file is the same data where it is read.
- **Diffing the repo's `main` rather than the published release.** Upstream `main` is not
  what a user installs, and it moves every day, which would make the watch a firehose.
  Releases are the events with a maintenance band attached.
- **Failing CI on a stale weight claim.** A competitor getting heavier is not our
  regression, and a red build we cannot fix by changing our own code teaches people to
  ignore red. It is an issue.

## Out of scope

- Re-vendoring. `compat-refresh.yml` already opens the weekly PR that moves `vendor/`; this
  watch only reports and never writes there.
- Implementing anything a competitor added. The issue is the handoff; the work is a normal
  intent with its own gate.
- Competitors of packages we have not published. `compat-oracle` is private and grades; it
  competes with nothing.
- A dashboard. The scoreboard page already exists (`docs-deploy`); a stale claim showing
  there is a follow-up, not part of this.
- Watching transitive dependencies of a competitor individually. The weight number covers
  the whole resolved tree; a sixteen-package chain moving shows up as one number moving,
  which is the number we publish.
