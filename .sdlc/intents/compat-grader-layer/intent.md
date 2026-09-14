# Intent — the compatibility grader is a layer, not a private package

**Status:** draft · **Opened:** `2026-09-14` · **Owner:** `@ofri-peretz`

Triggered 2026-09-14 while draining the PR queue to zero. `chore(release): version
packages` kept reopening empty (`+0/-0`) and unmergeable. The cause is four changesets on
`main` — `optional-deps-counted`, `picocolors-pair`, `skipped-is-not-a-pass`,
`upstream-watch-competitors` — all four targeting `compat-oracle`, which is
`"private": true` while `.changeset/config.json` sets
`privatePackages: { version: false, tag: false }`. Changesets is doing what it was told:
it has pending changesets so it opens a Version PR, and it refuses to version a private
package, so the PR has no diff. Four authored changelog entries can never be released and
the queue has no empty state. The empty PR is the symptom; the package's status is the
cause.

---

## What is wanted

The thing that grades a drop-in replacement against the incumbent's own test suite is one
of this family's layers, with a name, a README that leads with its own job, a published
version, and a docs home — the same standard rule 8 holds every other package to. Nothing
in the tree claims a domain it is not allowed to ship.

Concretely, once this lands: `packages/compat-oracle` no longer exists under that name;
its domain belongs to a published package; the four stranded changesets have been released
or deliberately retired; and a Version PR is either non-empty or absent.

## Why now

**No layer owns this today, and I checked rather than assumed.** Every workspace in this
repo, and every package in `eslint/`, `interlace/`, `agents/` and `interlace-ds-viz/`,
read on 2026-09-14:

|                                                                          |       |
| :----------------------------------------------------------------------- | ----: |
| published layers in this family                                          |     9 |
| of those whose domain is runtime behaviour                               |     9 |
| packages anywhere in the ecosystem whose domain is compatibility grading | **0** |

The nine — `burgee`, `roundel`, `flagstaff`, `caique`, `linegauge`, `closeout`,
`seniority`, `bellpull`, `paratext` — each own something that happens while a CLI runs:
measuring text, colour, precedence, shutdown, subprocesses, prompts, OSC sequences, output
widgets, the engine. Grading happens before any of that, at build time, about all of them.
It is not a corner of an existing layer and cannot be filed under one.

**What it actually is.** `npm run compat` vendors each incumbent's own suite unedited,
redirects its imports at our implementation through a one-line shim, runs a control pass
against the _real_ incumbent to prove the gate can fail, and prints a pass rate per host
that only ratchets up. `packages/compat-oracle` is 36 source files and 5,808 lines over
322 vendored fixtures, exporting `./demand`, `./drivers/commander`, `./drivers/yargs`,
`./hosts`, `./provenance`, `./upstream` and `./vendor`, and depending on `burgee`,
`flagstaff` and `roundel` — it sits above all three.

**It is already load-bearing for the whole family.** `.sdlc/intents/layer-roadmap.md`
grades eight layers in one table, and every number in its `graded` column comes from this
package:

| layer     | graded                                            |
| :-------- | :------------------------------------------------ |
| burgee    | commander 1361/1361 · yargs 804/804               |
| roundel   | chalk 58/58                                       |
| flagstaff | ora 99 · log-update 99 · boxen 84 · cli-table3 29 |
| linegauge | string-width 201/229                              |

It is wired into `compat.yml`, `compat-refresh.yml`, `compat-upstream.yml`,
`auto-deploy.yml`, `dependabot.yml`, `.sdlc/bands/control-bands.json`, the benchmark
suite's compatibility axis, and the README's grading table.

**Rule 3 is an ecosystem rule and this is its only implementation.** "Drop-in for the
incumbent, graded by its own tests… a control run proving the gate and a published pass
rate that only ratchets up. 'Compatible' is a number, never a sentence." Every product
that replaces something owes that number. One repo has the instrument that produces it,
unpublished, and its own `package.json` says "Internal; never published."

Rule 4 sharpens it: "No public claim without a measurement, a command that produced it, a
date, and a page it lives on." The command is `npm run compat` and nobody outside this
repo can run it.

## Affected users and systems

- `packages/compat-oracle` — renamed, extracted, or published in place.
- The four stranded changesets, and `.changeset/config.json`'s `privatePackages` policy.
- `compat.yml`, `compat-refresh.yml`, `compat-upstream.yml`, `auto-deploy.yml`,
  `dependabot.yml` — every one names the package or its path.
- `.sdlc/bands/control-bands.json` and `benchmarks/axes/compat.ts` — the compatibility axis
  reads its output.
- `.sdlc/intents/layer-roadmap.md` — an eight-row table that would gain the instrument that
  fills its `graded` column.
- `.sdlc/intents/docs-per-package/intent.md` — a five-site map over nine packages; a tenth
  published package needs a home in it.
- `packages/conformance` — a second private harness ("one suite, two hosts") with an
  adjacent job. Whether it merges into this layer or stays separate is open.

## Constraints

- **Rule 2 is the hard one.** "A published package depends only on packages published from
  its own repo, and only on ones earlier in a declared order." The grader depends on
  `burgee`, `flagstaff` and `roundel`, so inside this repo it is simply last in the order
  and rule 2 holds. But its value is ecosystem-wide — `eslint/`'s plugins make
  compatibility claims too — and a cross-repo dependency breaks rule 2 outright. A design
  that makes it reusable by `eslint/` must say how, or say that it does not.
- The published pass rates only ratchet up (rule 3). Nothing in the move may reset a
  baseline or drop a graded row.
- The vendored suites run unedited. Whatever they `require` stays a declared dependency,
  pinned — the reason `cli-table` is installed today.
- `burgee@0.6.1` is live. Extraction must not change what `burgee` ships.
- The control run must keep proving the gate can fail. A grader that cannot fail is not a
  grader.

## Success criteria

1. `npm run compat` produces the same rows, from a package whose `private` field is `false`.
2. `npm view <name> version` returns a version.
3. `.changeset/` holds no changeset that targets a package the config refuses to version.
   The check for this is **written and proven red** — `scripts/changeset-targets-lock.test.ts`,
   held back from `main` because it fails on today's tree by design:

   ```
   AssertionError: expected [ …(4) ] to deeply equal []
   + ".changeset/optional-deps-counted.md -> compat-oracle (private)",
   + ".changeset/picocolors-pair.md -> compat-oracle (private)",
   + ".changeset/skipped-is-not-a-pass.md -> compat-oracle (private)",
   + ".changeset/upstream-watch-competitors.md -> compat-oracle (private)",
   ```

   It lands with whichever resolution open question 5 takes, not before — a lock that is
   red on `main` is not a lock.

4. Two consecutive pushes to `main` produce no empty Version PR.
5. `layer-roadmap.md` lists it among the layers, with its own incumbents named.
6. It has a docs home in `docs-per-package`'s map.

## Open questions

1. **Name.** The family names are nautical or from printing — `burgee`, `flagstaff`,
   `caique`, `bellpull`, `linegauge`, `paratext`. `loadline` is free on npm today
   (2026-09-14) and is the mark on a hull that says how deeply it may be loaded: a
   published limit, verified by survey, that you may not cross. `plimsoll` (the same mark),
   `assay`, `waterline` and `freeboard` are all taken. The name is the owner's call.
2. **Does it leave this repo?** Rule 10 is one repo per family. If `eslint/` is to be
   graded by the same instrument, the grader is its own family and the vendored suites
   travel with it — a much larger move than a rename. If it stays, it is burgee-family only
   and `eslint/` keeps making compatibility claims with no instrument.
3. **What happens to `conformance`?** Same private status, adjacent job, not covered by
   this intent's evidence.
4. **Do the vendored suites ship in the tarball?** 322 files of someone else's tests, under
   their own licences. Publishing the grader without them makes it un-runnable by a
   stranger; publishing with them is a licence question this intent has not answered.
5. **The four changesets.** Released with the first version of the new package, or retired
   because their prose already lives in the commits that introduced them?
