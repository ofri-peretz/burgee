# Design — `compat-oracle`

Intent: [`intent.md`](./intent.md). **Status:** approved (2026-09-23, under the owner's delegation, D-129).

---

## Requirements

**These were a table until 2026-09-16, and a table is a place the roadmap cannot read.**
`scripts/plan-progress.ts`'s `designGap()` finds requirements by the pattern `- **R<n>`, so
ten requirement families in table rows answered `the design lists no requirements` — the
same answer a design with none would get, for the package whose whole job is refusing to
publish an unmeasured number. The wording of C1–C6 and R1–R4 below is carried over from
that table unchanged; where the tree has since made a bar wrong, the bar is restated in
[§ Requirements restated](#requirements-restated) with its **original sentence kept beside
it**, because a bar that is restated and then vanishes is indistinguishable from one that
was quietly met (`linegauge/spec.md`).

- **C1** Every published package declares its supported host range, and the compatibility page names the **majors graded**: the host's current major first (suite at the latest release tag), earlier majors only once their own suite is vendored at its last tag and graded — a major is never listed on the strength of the next one's suite
- **C2** A compat front-end is graded by the host's own suite through a one-line shim; the pass rate is emitted as JSON and published per release
- **C3** Every package is tested on every Node LTS inside its `engines` range, on Linux, macOS and Windows. **Narrowed to Node 24 only on 2026-09-08** while the output stack lands — three OSes, one version — so this control is not met until 26 goes back into `compat.yml`'s matrix. **Restored 2026-09-23:** 26 is back in the matrix after the whole suite passed on v26.10.0.
- **C4** *(restated 2026-09-23, D-130)* Every subtraction from a published number is declared in `hosts.ts` with a mandatory written reason, in one of four named kinds, is published on the compatibility page, and the gate refuses one that matches nothing. *As first written:* every intentional divergence from a host has an id, a written reason, and a test asserting the divergence — an unlisted failure is a bug, a listed one is a documented difference
- **C5** *(restated 2026-09-23, D-130)* Pass rates ratchet: a PR that lowers one fails CI unless it edits the baseline fragment; the reason is a convention, not a gate. *As first written:* a PR that lowers one fails CI unless it also edits the baseline file with a reason
- **C6** Each vendored suite is pinned to a host's npm **release** (version, tag, commit) and fingerprinted in a compatibility record — a hash per test file, the test names per file, the names on the API surface. A daily job diffs the latest release against the record and opens one issue per release naming exactly the tests and surface names that appeared, vanished or changed; a weekly job re-vendors at the new tag and opens the PR carrying the same diff
- **R1** *(restated 2026-09-23, D-130)* `npm run compat` grades every active host and exits non-zero on a regression, warm, in under 60 s. *As first written:* runs both hosts, in under 60s
- **R2** The import rewrite is a scripted transform, re-runnable from a clean upstream checkout, never a hand edit
- **R3** *(restated 2026-09-23, D-130)* No upstream file is excluded **for importing an internal module** — that class is shimmed, run, and reported on an informational line; files and cases leave the gate only through `ungradedDirs` or `excludes`, each with a written reason and each refused when it stops matching. *As first written:* **No upstream file is excluded.** Every file is vendored and run; files that import only the host's internal modules are graded on a separate, informational *internals* line, recorded by name in `.source.json`. Passing them would mean copying the host's file layout, so they never enter the gate — but they are never hidden either
- **R4** The compatibility record (`vendor/<host>/.source.json`) is written by the vendor step and the diff between two records is computed (`diffRecords`), never described by hand; `npm run compat -- --upstream` produces it without touching `vendor/`

Three more, added 2026-09-16 and numbered on from R4. R5 is a bar the tree already clears
and the original ten never stated; R6 and R7 are **measurement hazards this lane found in
its own tooling, each of which produced a wrong number before it was caught.** They are
requirements rather than footnotes for the reason C4 gives about exclusions: a hazard that
lives only in a comment is a hazard nothing can go red for.

- **R5** A published rate does not read the machine that measured it. Where a suite registers a different number of cases on different platforms, the denominator is the **full** set on every platform and the shortfall is declared per host, exact rather than a ceiling; a control that counts more cases than its recorded reference is red, because that is proof the reference is not this suite
- **R6** A vendor or mining run refuses to read another checkout's build. The oracle's own modules are reached in a way that cannot silently resolve out of this working tree, and a run that cannot resolve them fails loudly rather than grading against a table it did not read
- **R7** A published rate is reproducible at rest, and a row that moves under machine load is readable as load rather than as a regression — by the harness, not only by a paragraph in `hosts.ts`

## What is built

Checked against the tree on 2026-09-16 on `lane/harness-oracle-design`, at
`f629b8ee20`, on darwin / Node 24.18.0, with `node_modules` installed **in this worktree**
(see R6 — a worktree without them measures a different repository). The Status cell holds
two words and nothing else, `Built` or `Not built`; `Not built` is a verdict this table is
expected to carry, not a failure of it.

| id | Status | What shipped, and where | The check |
| :-- | :-- | :-- | :-- |
| C1 | **Not built** | Neither half. **No published package declares a host range**: `bellpull`, `burgee`, `caique`, `closeout`, `flagstaff`, `linegauge`, `paratext`, `roundel` and `seniority` all declare an empty `peerDependencies`, and the only host ranges in the tree are `compat-oracle`'s own (`commander >=12`, `yargs >=17`, `ora >=9`, `log-update >=8`) on a package that is `private: true` and never published. The **majors table is hand-written prose inside the generator** (`scripts/compat-page.ts`, § Supported majors) naming six hosts against 21 active, so 15 graded hosts publish no major at all, and it cannot drift-check because nothing derives it. The half that does hold: every graded major is pinned to a release in `.source.json` (`version`, `tag`, `commit`) and `vendor/` holds one directory per host and none per major, so no major is listed on the strength of the next one's suite | `node -e "…"` over `packages/*/package.json` prints `peer: {}` for all nine published packages; `ls packages/compat-oracle/vendor` — 22 directories, one per host |
| C2 | **Built** | `src/shim.ts` is the documented one-liner, and the run writes one generated shim per declared import (`writeShims` in `src/run.ts`) so a single unedited suite grades any implementation with one env var changed. Rates are emitted as JSON by `writeResults` to `results.json` and `results.control.json`, and published to `apps/docs/content/docs/compatibility.mdx`, which the Ratchet job regenerates and compares on every PR. Read "per release" as *per merge to main*: the docs deploy is what publishes, and it runs at least as often as a release | `npm run compat && npx tsx scripts/compat-page.ts --check` — exits 0, `compatibility.mdx matches the measured results` |
| C3 | **Built** | `compat.yml`'s `matrix` job runs Linux, macOS and Windows × Node **24 and 26** — every even major `engines: >=24` admits. 26 was narrowed out on 2026-09-08 to halve CI while the output stack landed (#64) and came back on 2026-09-23, after the whole suite passed on v26.10.0: 767 root tests and every package's. It is graded a month before its LTS promotion, not first as one. Since D-132 (2026-09-23) the published packages' `engines` also admits 20.19+ and 22.13+, and the `floor` job runs each of their suites on exactly those two versions on the same three OSes | `.github/workflows/compat.yml` `matrix.node`, `floor` `matrix.node`; `npm test` on Node 26.10.0 |
| C4 | **Built** | Restated by D-130. Four named kinds of subtraction in `hosts.ts` — `excludes`, `controlFailures`, `conditionalCases`, `ungradedDirs` — each with a mandatory reason a lock refuses empty, each refused by the gate when it matches nothing, and all four published on `compatibility.mdx` | `scripts/compat-page-subtractions.test.ts`; `npx vitest run --root packages/compat-oracle -t 'excluding a case that cannot fail for any target'` |
| C5 | **Built**, with its second clause unenforced | `regressed()` in `src/run.ts` and `verdict()` in `src/report.ts` fail the run when a host's pass count falls below `baseline/<host>.json`, one fragment per host. Proven red before it was trusted, per rule 4. The clause nothing enforces is *"with a reason"*: lowering a fragment is an ordinary file edit, and no check reads a reason out of it or out of the PR body — the sentence lives in `scripts/compat-page.ts` and in this file and is a convention, not a gate | `npx vitest run --root packages/compat-oracle -t 'the compatibility ratchet'` — *flags one test below the baseline as a regression* / *accepts the baseline itself, and anything above it* |
| C6 | **Built**; wired, unit-tested, and not yet exercised by a real release | `.source.json` is `CompatRecord` in `src/upstream.ts` and carries all three fingerprints C6 names, not a subset: a sha256 per test **and** surface file (`hashes`), the test names per file (`tests`) and the exported plus `Class.method` names per surface file (`surface`) — alongside `repo`, `version`, `tag`, `commit`, `vendored`. The daily `compat-upstream.yml` (`cron: 17 6 * * *`) opens one issue per new release carrying that diff; the weekly `compat-refresh.yml` (`cron: 30 5 * * 1`) re-vendors and opens the PR with `vendor-diff.md`. What is missing is exercise rather than wiring — no incumbent has released since this repository was created, which is why PLAN 4.4 is a `manual:` step | `npx vitest run --root packages/compat-oracle src/upstream.test.ts`; `npm run compat -- --upstream` |
| R1 | **Built**, and by a wider margin than it was written for | Measured on this branch: `npm run compat` grades **21 active hosts in 43.7 s** warm and exits 0, having been run three times in the session with every row at `▲ 0`. The requirement says "both hosts" because two were all there were; the gate now carries 21 and still clears the 60 s budget. Two things the sentence does not say and a reader needs: the budget is a **warm** one — the first grade of a clean checkout also runs `installSuiteDeps`, which for `dotenv` alone is 319 packages and 86 MB — and `compat` is **not in `lefthook.yml`'s pre-push battery**, which runs typecheck, test, build and the root vitest suite. The 60 s was the intent's argument for putting it there; the placement never happened | `time npm run compat` — `real 0m43.664s`, exit 0 |
| R2 | **Built** | The transform is `rewriteAt` in `src/vendor.ts` — a pure string function over `host.imports`, relativised against the directory of the file that holds the specifier, applied tree-wide by `rewriteTree`. No shim is ever committed beside a suite; `vendor()` deletes any it finds. Re-runnable from a clean upstream checkout and **reproduced byte for byte**: `scripts/vendor-suite.ts` records vendoring chalk 6.0.0 into a scratch directory and `diff -r` against the committed copy returning no output. The design's file map named `rewrite.ts`; no such file was ever written, and the function lives in `vendor.ts` beside the copy step that calls it | `npx vitest run --root packages/compat-oracle src/vendor.test.ts -t 'rewriting public specifiers'`; `npx tsx scripts/vendor-suite.ts chalk --version 6.0.0 --into /tmp/v --vendored 2026-09-08 && diff -r packages/compat-oracle/vendor/chalk /tmp/v/chalk` |
| R3 | **Built** | Restated by D-130. No file is dropped for importing an internal: `writeInternalShims` shims each internal specifier, internals-only files are named in `.source.json`'s `internalFiles` and graded on the informational internals line. Directories and cases leave the gate only through `ungradedDirs` and `excludes`, each with a reason, each refused when unmatched | `npx vitest run --root packages/compat-oracle src/vendored-suite.test.ts -t 'every vendored test file is graded or named'` |
| R4 | **Built** | `diffRecords` in `src/upstream.ts` compares all three axes — per-file sha256, test names per file and surface names per file, each flattened to `<file> :: <name>` so a rename reads as one removed and one added — and `renderDiff` is the only thing that turns a diff into prose, so no diff is ever described by hand. `npm run compat -- --upstream` fingerprints the latest release inside `mkdtempSync` and `rmSync`s it in a `finally`; on that path `vendor/` is read through `readRecord` and never written, and the only output is `upstream.json` | `npm run compat -- --upstream`; `npx vitest run --root packages/compat-oracle src/upstream.test.ts` |
| R5 | **Built** — and by work that landed *after* this design | `conditionalCases` in `src/hosts.ts` declares, per host, the cases a suite guards with `process.platform` and therefore never hands the runner at all. cosmiconfig's suite is **243 cases on ubuntu and 241 on darwin**, two behind `if (process.platform === 'linux')`, and before this the same commit published **77.2% from darwin and 76.5% from ubuntu** — caught by `compat:page --check` on PR #338, because `rate()` divides by `max(reference, registered)` and ubuntu registered more. The fix records the full set as the reference and declares what each platform lacks, so the denominator is 243 everywhere and the two cases we fail are still counted rather than excused — excluding them instead would have *raised* the published rate. Its other half is the new clause in `controlShortfall`: a control that counts **more** cases than its reference is now red | `npx vitest run --root packages/compat-oracle -t 'a suite whose case count depends on the platform'`; and *refuses a control that registers MORE than its reference* |
| R6 | **Built** | Every repository script reaches the oracle by relative path to `packages/compat-oracle/src/` — `vendor-suite.ts`, `mine-issues.ts`, `compat-page.ts` and `benchmarks/parity.test.ts`, seven specifiers in all — so a run can only read this tree's `HOSTS`, and needs no build first. Found by the lock on its first run: the design named two scripts and the tree had four | `scripts/oracle-import-lock.test.ts`: *"no script imports compat-oracle by package name"* — red on 2026-09-23 with the seven specifiers listed, green after |
| R7 | **Built** | the harness repeats and agrees: a row that fell — a target below its baseline, a control below its reference — is graded again up to `REPEATS` (2) more times, and is red only if every attempt agrees. A recovery is **named** on the run's output with each attempt's count (`17 → 21 passing`) and recorded on the grade as `attempts`, so a flake is a counted fact rather than a red that went away; a real regression fails every attempt and stays red, and a green run re-runs nothing. The per-host fixes stay where they are — `exit-hook`'s readiness signal, cosmiconfig's `testTimeout` — and this is the net under them | `src/gate.test.ts` → *repeat and agree (R7)* |

### Requirements restated

Four bars the tree has moved. The original sentence is kept verbatim so a reader can see
what was asked for and what is now claimed in its place.

| id | As written | As the tree makes it | Why it moved |
| :-- | :-- | :-- | :-- |
| C4 | "Every intentional divergence from a host has an **id**, a written reason, and a test asserting the divergence" | Every *subtraction from the published number* is declared in `hosts.ts` with a mandatory written reason, in one of four named kinds, and the gate refuses one that matches nothing or that is declared on a runner whose TAP cannot name cases. There is no id and no per-divergence test | The oracle grades somebody else's suite, so a divergence is a *case name*, not a feature of ours to hold an id. The gate refusing a stale exclusion is what the id was for. The bar that is still owed and still missing is publication: three of the four kinds never reach `compatibility.mdx` |
| R1 | "`npm run compat` runs **both hosts** and exits non-zero on a regression, in under 60s" | `npm run compat` grades **every active host** — 21 today — and exits non-zero on a regression, warm, in under 60 s. The budget is a warm one; the first grade of a clean checkout also installs each suite's pinned dependencies | Two hosts was the whole plan when this was written. The number grew tenfold and the budget held: 43.7 s measured. The clause that quietly did not survive is the intent's, not R1's — this was to "sit in the pre-push hook", and `lefthook.yml` does not run it |
| R3 | "**No upstream file is excluded.** Every file is vendored and run" | No upstream file is excluded **for importing an internal module** — that class is shimmed, run, and reported on an informational line. Files and cases may leave the gate only through `ungradedDirs` or `excludes`, each costing a written reason and each refused when it stops matching | `test/issues/` sat vendored, committed and graded by nobody for a release because nothing had to say so out loud. The answer was not to grade everything — yargs' `fixtures/` are programs the tests spawn — but to make every omission a declaration with a date on it |
| C5 | "a PR that lowers one fails CI **unless it also edits the baseline file with a reason**" | A PR that lowers one fails CI unless it edits the baseline fragment. The reason is a convention, not a gate | Stated so the unenforced half is visible. Nothing reads a reason out of a fragment or a PR body today |

### Landed after this design was written

Five things the tree gained since 2026-09-08 that a design written then could not know, and
what each one settles above.

- **`unsatisfiedPins`** (`src/run.ts`) — a pin is satisfied only by a copy under
  `<dir>/node_modules/` at that exact version. Resolving the *name* was the check before,
  and it walks up and out of the repository: it graded cosmiconfig's 10.0.1 suite against
  the 9.0.2 this workspace hoists (control 234 / 241 against an allowance of 1), and it
  resolved `rc` out of a stray `/Users/<operator>/node_modules` holding 572 packages, on a
  checkout with nothing installed beside the suite. It is what makes C2's number the number
  a stranger gets, and it is the same defect class as R6.
- **The `tap` runner arm** (`runTapFiles`, `src/run.ts`) — specified in `Host['runner']`'s
  comment from the day it was written and never implemented, so a host declaring `tap` fell
  through to mocha's `return` and would have graded **zero**. `dotenv` is the first row
  through it at a 141 / 141 control. It also retires the first of the four blockers named on
  `signal-exit` (see below).
- **`conditionalCases`** — R5, above.
- **`suiteDeps` and `installSuiteDeps`** — a route that installs an incumbent and its
  suite's dependencies into `vendor/<host>/node_modules` at an exact pin, touching **neither
  the workspace manifest nor the lockfile**. Six hosts use it. It is what unblocked `rc`,
  whose note had recorded the opposite ("nothing installs a vendored manifest" — true of
  `vendorDeps`, false of this), and it is the lockfile-free answer the lane brief names.
- **Twenty-one baseline fragments**, one per active host, reconciled with `hosts.ts` by
  `baseline-scope.test.ts` in both directions — a `planned` host that loses its flag takes
  the whole compat axis to `? unmeasured`, and an `active` host that keeps one is graded
  into a rate nobody publishes.

**Two notes this reconciliation found stale, in entries other lanes own.** They are recorded
here and not edited there, per `.sdlc/LANES.md`: a package lane owns its own incumbents'
entries in `hosts.ts`.

- `signal-exit` (closeout) is `planned` behind four named blockers, and **the first is
  gone**: it reads *"Its runner is `tap`, and `Host['runner']` has no such member"*, and
  `tap` is a member with a working arm. `suiteDeps` also answers the second blocker's
  premise — that `tap` and `ts-node` are "declared in neither manifest" — without a lockfile
  edit. The `dist` entry in `INTERNAL_PATTERNS` and the `tap-snapshots` format remain, and
  `INTERNAL_PATTERNS` is this lane's file.
- `exit-hook` (closeout) records a blocker reading *"`writeInternalShims()` calls
  `packageRoot(host.name)` **eagerly** … Moving that call inside the loop is one line"*. That
  line has landed — the call is guarded by `internals.length > 0` — and the row grades
  21 / 21 on a plain `npm ci`.

## Design

```
packages/compat-oracle/
  vendor/
    commander/            # upstream tests, unmodified except the scripted rewrite
      .source.json        # { repo, commit, date, testCount }
      tests/*.test.js
    yargs/
      .source.json
      test/*.cjs
  src/
    shim.ts               # resolves the implementation under grade
    rewrite.ts            # the scripted specifier transform (R2)
    run.ts                # runs a host, parses node:test / mocha output, emits JSON
    report.ts             # table + ratchet comparison against the baseline
  excluded.json           # the 9 internals files, each with a reason (R3)
  baseline.json           # per-host { tests, passed, rate }
```

**The map above is the plan, kept as written; three of its names are not what got built.**
Recorded here rather than silently corrected, because the gap is the interesting part.

| Planned | Actual | Why |
| :-- | :-- | :-- |
| `src/rewrite.ts` | `rewriteAt` / `rewriteTree` in `src/vendor.ts` | The transform is a step of the copy, not a module anyone imports on its own. R2 is met; no `rewrite.ts` was ever written |
| `excluded.json` | four declaration kinds in `src/hosts.ts`, each with a mandatory `why` | The file would have held one kind. The four that exist are `excludes`, `controlFailures`, `ungradedDirs` and `conditionalCases` — see C4, which is **not built** because only the first of them reaches the published page |
| `baseline.json` | `baseline/<host>.json`, one fragment per host | PLAN `SHARD`. One dict meant six lanes editing one object and a merge conflict on every landing, for entries with nothing to do with each other. `plan-progress.ts`'s `SHARD` step asserts the directory exists **and the single file does not** |
| two hosts, `commander` and `yargs` | 21 active hosts, 6 planned, 1 rejected | The mechanism generalised. `src/hosts.ts` is 1,052 lines of data and the runner grew four more dialects — `ava`, `vitest`, `tap`, `exit-code` — beyond the `node:test` and `mocha` named below |

The shim is the whole trick. commander's tests import `from '../index.js'`; the
rewrite points that at `shim.js`, and the shim re-exports whichever implementation the
`COMPAT_TARGET` env var names:

```ts
// shim.ts — the single swap point
const target = process.env.COMPAT_TARGET ?? 'commander';
export * from target;
```

Grading real commander is the control (rule 4: the check must be proven against a known
state). Grading `commander-compat` later is the same command with one env var changed.

yargs differs in runner (mocha, `.cjs`) and is handled by a second adapter in `run.ts`
with the same output shape. Its suite is vendored the same way.

**Order of work.** Vendor commander first and prove 1,210/1,215 — that is the whole
mechanism, demonstrated. Then the ratchet and the JSON emit. Then yargs. Then the Node
matrix (C3) in `quality-full.yml`. Then the docs page. yargs before the matrix, because
a second host is what proves the runner abstraction is not commander-shaped.

**Node compatibility (C3)** is a matrix over `engines`, not a claim. Since D-132
(2026-09-23) every published package declares `node: "^20.19.0 || >=22.13.0"`, so the
matrix is Node 24 and Node 26 (`matrix`, every suite) plus the two floors, 20.19.0 and
22.13.0 (`floor`, the published suites), across three OSes. The versions are listed in the
workflow, not read from `engines`; `scripts/package-shape-lock.test.ts` fails when the
`floor` list and the `engines` floors disagree, so widening a range without widening the
matrix is a red test rather than a silent claim.

**Divergences (C4).** A front-end that intentionally differs registers the id in
`excluded.json` alongside a test in our own suite asserting the *new* behaviour. The
docs page renders that file, so the differences list is generated, never hand-maintained
— which is what stops it drifting the way every hand-written compatibility table does.

## Verification

`npm run compat` is the loop. It exits non-zero when a rate drops below baseline.

Proven-red requirement, per CLAUDE.md rule 4: `packages/compat-oracle/src/ratchet.test.ts`
constructs a run result one test below the baseline and asserts a non-zero exit, and a
run at baseline and asserts zero. A gate that has never been shown to fail is not a gate.

**That file is named `src/run.test.ts`** — there is no `ratchet.test.ts`; its
`describe('the compatibility ratchet')` block is the three cases this paragraph describes,
and `src/gate.test.ts` holds the control verdict's own proven-red cases. The requirement
stands exactly as written; only the filename moved.

`scripts/intent-artifacts-lock.test.ts` continues to assert this intent has both
artifacts.

## What the suites taught the harness (2026-09-08)

Three gaps that read as divergences for a day were the harness, and each fix was proven
red in `vendor.test.ts` / `run.test.ts` first: the vendored root now carries a `main`
pointing at the generated shim (commander's three `.cjs` files and yargs' fixture binaries
`require` the root as a package — 31 and 16 tests that had registered as one each) and
the upstream's `version`, `license` and `repository` (yargs reads its own
`package.json` as a config fixture); a shim for a default-exporting host also re-exports
it under the `module.exports` name, so `require()` of the ESM shim returns the callable;
a bare public specifier (`yargs-parser`) is rewritten literally, with a `control`
specifier for the real-host run; a test that skips itself on this OS is reported and never
counted; a run that registers more tests than the recorded reference uses the larger
count, so a rate can never exceed 1; and `COMPAT_TAP_DIR` keeps the raw TAP so a count
that moved can be read back to the names that moved it. The control's verdict is that its
suite ran and passed against its own package; it is not ratcheted against burgee's baseline.

**The suite's dependencies are the host's, at the vendored release.** `compat-oracle`'s
devDependencies for the suites (`which`, `mocha`, `chai`, `chalk`, `cross-spawn`, `cpr`,
`hashish`, `yargs-test-extends`) and the hosts themselves are pinned to what the upstream's
own package.json names at the vendored release, and dependabot is told to leave them alone:
a bump to `which@7` (promise-only) timed out yargs' integration tests twice in one day.
They move only through the re-vendor flow, which reads the upstream's package.json.

## Rejected alternatives

- **Write our own compatibility tests.** They would encode our reading of the host's
  behaviour, which is exactly the thing under test. The host's suite is the only
  disinterested oracle.
- **Git submodules for the upstream repos.** A submodule cannot carry the rewritten
  import specifier, and pinning a submodule is no more auditable than recording a commit
  in `.source.json`.
- **One blended compatibility percentage.** The two hosts disagree on observable
  behaviour; a single number would let a yargs regression hide behind commander's score.
- **Stub the 9 internals files so the count reaches 105/105.** Stubbing internals invents
  behaviour upstream never promised, and inflates the number that is supposed to be the
  honest one.
- **Run the suites only before a release.** The value is the ratchet on every PR; a
  quarterly run tells you something broke, not which commit broke it.

## Out of scope

- Grading `cli-core` — the oracle grades compat front-ends and layer packages against
  hosts, never our own host-neutral API against someone else's shape.
- Fixing upstream bugs the suite encodes. If commander's suite asserts behaviour we
  think is wrong, we match it and register a C4 divergence only if we deliberately differ.
- Performance and agent-efficiency measurement — that is `cli-benchmarks`.
