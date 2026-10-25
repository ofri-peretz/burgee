# Design — The foundation stack

Intent: [`intent.md`](./intent.md). **Status:** approved (2026-10-25, as the umbrella).

Children: [`linegauge`](../linegauge/spec.md) · [`seniority`](../seniority/spec.md) ·
[`bellpull`](../bellpull/spec.md) · [`closeout`](../closeout/spec.md).

**Restated:** 2026-10-18 — see § Restated 2026-10-18

---

## Design gate 2026-10-25

**Accepted as the umbrella**
([D-20261025-cli-foundation-stack-design-accepted](../../decisions/D-20261025-cli-foundation-stack-design-accepted.md)).
Y1, Y3 and Y5–Y11 hold through the children, as § Restated 2026-10-18 maps. This gate rules on
what had no owner.

**In scope.**

1. Y4: every layer names its builtin, and a probe asks whether the platform has absorbed it.
   - A lock asserts that each foundation README (`linegauge`, `seniority`, `bellpull`,
     `closeout`) names the Node builtin it composes. The builtins are `Intl.Segmenter` and
     `util.stripVTControlCharacters`, `process.loadEnvFile` and `util.parseEnv`,
     `child_process`, and `process.on(signal)`.
   - An absorption probe runs each layer's shared test vectors (or the graded incumbent cases
     the builtin can be pointed at) against the builtin alone, on every Node line the
     `compat.yml` floor job runs. It reports the count the builtin passes. It is reported, not
     gated. A count that rises on a new LTS opens an intent to deprecate that layer on purpose.
2. Y12: a lock asserts that the opening of each foundation README, its header and first
   paragraph, never names `burgee`. It sits beside `scripts/readme-opening-lock.test.ts` and is
   proven red by adding the word to one opening.

**Dropped at this gate.** Y2's combined weekly-downloads figure: it is a number about other
people's packages that is stale within a week. The bytes half is held. S3, the override
collapse: D-133 made it a measurement of one package. S5 moved to `first-adopter` A6 on
2026-10-19.

**What to measure.** The per-layer, per-Node absorption counts from the first probe run,
recorded in the PR as the baseline the probe compares against.

## Restated 2026-10-18

**Nine of twelve floor rows are held on main (most through a child), Y8 moves to the children, and three rows keep an unowned piece. REMAINING: Y2 incumbent-count and weekly-downloads half unlocked, Y4 platform-absorption check per Node LTS unbuilt, Y12 no-burgee README opening unlocked (S3 and S5, success criteria, are the other two; see `intent.md`).**

Read on `main` at `1013b65db5` (2026-10-18); no test was run, and every check below was
located on that commit by file and test name. The requirement text below is kept as written.
Each child cites the Y row it implements by ID in its own requirement (`closeout` R6 is `(Y3)`);
a child's success criterion is cited by position (`closeout-at-incumbent-weight` S1 is item 1 of
its `## Success criteria`).

| ID | promised | on main | check | disposition |
| :-- | :-- | :-- | :-- | :-- |
| Y1 | a foundation package imports nothing but Node; `burgee` never depends on one; shared logic kept as two copies with a test-vector file | the floor half holds and is locked for the six-package tier (`paratext` and `roundel` joined). The `burgee` half was reversed: `burgee` depends on `bellpull`, `closeout`, `linegauge`, `seniority`, and `precedence.ts` moved into `seniority` | `scripts/package-shape-lock.test.ts` › "the foundation tier (Y1)" › "%s depends on nothing: it is the floor" and › "%s reaches nothing in the family: the arrow points one way"; › "a leaf depends on nothing in the repo" › "%s has no edge to a sibling, in any dependency field" | restated (PR #219, `ac7b9e5c30`; `burgee/spec.md` U1, D-130), held |
| Y2 | each README and benchmark page states incumbents replaced, their combined weekly downloads, and the installed bytes removed, by `npm i` + `du` on the day | the bytes half is built and generated: each README prints "Weight, installed and tree-inclusive: N bytes against M for the incumbents it replaces", from `foundation-ceilings.json` (PLAN D1, `installedBytes` in `benchmarks/axes/weight.ts`). The incumbents and their weekly downloads appear in hand-written Compatibility tables; no combined figure is printed and nothing locks them | `scripts/readme-benchmarks-lock.test.ts` › "matches what was measured, so a hand edit goes red"; `scripts/foundation-ceilings-lock.test.ts` › "agrees with itself: the ceiling is the sum, and the ratio is ours over it" | restated (PLAN D1 method), bytes half held; incumbent-count and weekly-downloads half remaining (no child requirement owns it) |
| Y3 | each root default export matches its incumbent so `overrides` aliasing works; a documented recipe per package, gated on Y7; a fixture runs the incumbent's suite through the override | restated by D-133: an override can aim only at a package root, so the drop-ins are named subpaths (`closeout/signal-exit`, `seniority/find-up`, `bellpull/cross-spawn`…) swapped by import and by `burgee migrate`; only `linegauge`'s root (`width` = `string-width`'s default) is an override target. Each subpath is graded by its incumbent's suite through the oracle, and every printed recipe must resolve | `scripts/override-recipe-lock.test.ts` › "an overrides recipe resolves against our root"; `packages/linegauge/src/shape.test.ts` › "the root default is `width` under require, which is what the string-width override resolves" | restated (D-133), held via `linegauge` R8, `seniority` R8, `bellpull` R7 (restated 2026-09-16), `closeout` R6 (D-133) |
| Y4 | each README names the builtin it composes; a platform-absorption test re-runs at each Node LTS; an absorbed layer is deprecated on purpose | no platform-absorption test exists, and no child requirement owns one | none | remaining: needs an owner (a new intent, or a requirement in each child) |
| Y5 | every structured result has one value and three renderings | built in all three layers that return a record | `packages/seniority/src/explain.test.ts` › "the human text `explain` prints IS the record rendered — same function, same bytes"; `packages/bellpull/src/matrix.test.ts` › "one result, three renderings (R5, Y5)"; `packages/closeout/src/report.test.ts` › "the --json projection" and › "the agent projection" | held via `seniority` R4, `bellpull` R5, `closeout` R2 |
| Y6 | provenance where a value has a source | built | `packages/seniority/src/discovery.test.ts` › "is on the layer `discover` hands back, so `--explain` and R12 can cite a line"; `packages/bellpull/src/which.test.ts` › "reports the PATH entry that answered"; `packages/closeout/src/registry.test.ts` › "tells a handler which door the program left by" | held via `seniority` R3, `bellpull` R3, `closeout` R2 |
| Y7 | thirteen suites vendored, `--control` first, ratcheting; the pass rate is a safety interlock | all thirteen graded (figures in `intent.md` S2); execa reads 0 / 1179 as a declared `ceiling`, which is the interlock working: no recipe or migration may name `bellpull` for execa (D-160) | `.github/workflows/compat.yml` job "Ratchet · each host's suite against burgee"; `packages/compat-oracle/src/gate.test.ts` › "fails a known-good implementation that is one case short of its own suite" | held via `linegauge` R10, `closeout` R9, `seniority` R10, `bellpull` R9 |
| Y8 | each package at or under the lightest zero-dependency incumbent on bundled bytes and spawn delta, baselines in `.sdlc/bands/` | restated by PLAN D1: the ceiling is the incumbents' installed bytes including their trees, recorded in `.sdlc/bands/foundation-ceilings.json`; every layer is under it there. The bundled and spawn halves are per child, and two are open: `closeout`'s drop-ins bundle heavier than `signal-exit` and `exit-hook` (B4 ratchets 1.31 and 2.98), and `seniority`'s spawn delta is unmeasured | `scripts/foundation-ceilings-lock.test.ts` › "holds every layer’s `ours` with a test in that package, since this file does not re-measure" | restated (PLAN D1); moved → `linegauge` R9 (held), `seniority` R9, `bellpull` R8, `closeout` R8 with `closeout-at-incumbent-weight` S1 |
| Y9 | nothing reads `process.*`; the env-reference grep extends to the four | built: `linegauge` names the process nowhere; `seniority` (D-135), `bellpull` and `closeout` each have one seam file | `packages/burgee/src/process-reference-lock.test.ts` › "no layer source reads process.* outside the three files that own it" | held via `linegauge` R11, `seniority` R11, `bellpull` R10, `closeout` R7 |
| Y10 | cleanup, spawn and the upward walk each have a finite, overridable deadline reported as an outcome | built | `packages/closeout/src/registry.test.ts` › "stops waiting for a handler that never settles"; `packages/bellpull/src/matrix.test.ts` › "the deadline, end to end (R2, Y10)"; `packages/seniority/src/search.test.ts` › "visits at most WALK_LIMIT directories, so a pathological depth cannot hang a start-up" | held via `closeout` R3, `bellpull` R2, `seniority` R5 |
| Y11 | every fast path locked by a differential test against the slow path | built where a fast path exists (`linegauge`'s ASCII scan) | `packages/linegauge/src/differential.test.ts` › "R2 — the ASCII fast path answers what the Segmenter path answers" | held via `linegauge` R2 |
| Y12 | own README, competitors, benchmark page, useful alone; burgee not above the fold (mirrors U12) | each package installs and loads alone, has its own docs site and README header, and its README opens with its incumbent and links its benchmark page. The adopter half of U12 left the gate under D-20261009-burgee-u12-1-0 (see `intent.md` S5). No lock asserts the opening never names burgee (true on `1013b65db5` by reading) | `scripts/independence-install-lock.test.ts` › "installs nothing but itself and the in-family packages it declares"; `scripts/readme-opening-lock.test.ts` › "every published README opens with the incumbent it replaces, then its agent surface"; `scripts/package-readme-header-lock.test.ts` › "every published README has the family header and shape"; `scripts/readme-benchmarks-lock.test.ts` › "every package README links the published page" | restated (D-20261009-burgee-u12-1-0), held except the no-burgee clause → remaining |

**Design text the tree contradicts**, kept below as written:

- *§ Where the shared `Runtime` type lives* promised "a test in this umbrella's directory that
  reads all four `dist/` outputs and asserts the declared shapes are structurally identical".
  No such test exists; the shared rule that holds instead is the one-seam-file process lock (Y9).
  Recorded here as an unbuilt design detail, not a requirement row.
- *§ Out of scope*, "A CLI in any of the four packages" — each ships a `bin` that is its plugin
  `check` command (PRINCIPLES 7); see `intent.md` § Restated 2026-10-18.
- *§ The roadmap* F1–F4 ran: all four packages are published. The `tinyexec` re-check was
  decided by D-048 and `bellpull` shipped.

## Requirements

Floor additions **Y1–Y12**, cited by the four children. `Y` is simply the next free letter;
every other one is taken.

- **Y1 The arrow points down and never back.** A foundation package imports nothing but
  Node builtins. `packages/burgee` never depends on one — it keeps its own copy of any
  shared logic, and the two copies share a test-vector file. `flagstaff` and `caique` may
  depend on one, because they sit above the line and ship from this repo (U1, U6).
  Locked by the existing dependency shape lock, extended to refuse a `burgee` → foundation
  edge by name.
- **Y2 Consolidation is a published number, not an adjective.** Each package's README and
  benchmark page state: incumbents replaced, their combined weekly downloads, and the
  **installed bytes removed**, all measured by `npm i <incumbent> && du -sk node_modules`
  on the day of publication, never from a badge or from memory.
- **Y3 Override-first distribution.** The default export of each package matches the
  incumbent's exactly, because `overrides: { "string-width": "npm:linegauge@^1" }` makes
  `require('string-width')` resolve to our `main`. Every package ships a documented
  override recipe, and the recipe is gated on Y7. Locked by a fixture that installs the
  override and runs the incumbent's own suite through the substituted package.
- **Y4 The builtin is a component, never a competitor.** Each package names in its README
  the Node builtin it composes — `Intl.Segmenter`, `process.loadEnvFile()`,
  `child_process`, `process.on(signal)` — and is re-run through the platform-absorption
  test at each Node LTS. **A layer whose builtin becomes a substitute is deprecated on
  purpose**, with a README that says so, not defended.
- **Y5 Every structured result has a static projection.** Anything that returns a record —
  a resolution, a subprocess result, an exit report — renders as human text, as a `--json`
  envelope, and as an agent event from that one value (rule 6, U3). No layer formats twice.
- **Y6 Provenance where a value has a source.** `seniority`: which of flag / env / project
  file / home file / default set this, and where. `bellpull`: which executable ran, resolved
  from which `PATH` entry. `closeout`: which exit path fired, and which handlers ran.
  A value without its origin is the failure mode that strands an agent repairing a
  configuration it cannot see.
- **Y7 Graded by the incumbents' own suites, before any recommendation.** Thirteen suites
  vendored into `compat-oracle`, `--control` proving the gate against the real package
  first, pass rates published and ratcheting (C1–C6). **The pass rate is a safety
  interlock**: an override edits packages deep in a stranger's tree, so an inexact drop-in
  breaks remotely and bafflingly.
- **Y8 Ceilings as CI gates.** Each package at or under the **lightest zero-dependency
  incumbent in its own layer** on both bundled bytes and spawn delta — not under the
  heaviest, which would be a free pass. Baselines in `.sdlc/bands/`, ratcheted like the
  tarball size (U5, B4).
- **Y9 Nothing reads `process.*`.** Everything takes a `Runtime`-shaped argument (T1); the
  env-reference grep extends to these four packages.
- **Y10 Anything that can hang has a deadline.** `closeout`'s cleanup, `bellpull`'s spawn,
  `seniority`'s upward walk. Finite by default, overridable by the caller, never infinite,
  and the timeout is an outcome in the result rather than a thrown surprise.
- **Y11 Fast path first; correctness never traded for it.** ASCII byte scan before
  `Intl.Segmenter`; `fs.existsSync` before any async ladder. Every fast path is locked by a
  **differential test against the slow path** over a corpus, so a specialisation that
  disagrees fails CI. This is the technique that made the 40-line glob specialisation
  trustworthy — 296 cases, three bugs caught.
- **Y12 Independent products.** Own README, own competitors, own benchmark page, useful
  with nothing else installed; burgee is not mentioned above the fold (mirrors U12).

## Design

### The roadmap — four waves, F1 to F4

Ordered by **what unblocks work already scheduled**, then by risk. Size is deliberately not
the ordering key; the largest layer is third.

| Wave | Package | Runs beside | Ends with | Gate to enter |
| :-- | :-- | :-- | :-- | :-- |
| **F1** | `linegauge` | stack S2 (`flagstaff`) | four suites graded; `flagstaff/src/width.ts` deleted; the grapheme table published | commander scoreboard public |
| **F2** | `closeout` | stack S3 (`caique`) | `signal-exit` and `exit-hook` graded; `caique`'s own signal handling deleted; a shutdown that cannot hang | F1's pass rate on the board |
| **F3** | `seniority` | engine wave 5 | `cosmiconfig`, `lilconfig`, `dotenv`, `rc` graded; the precedence truth table and `--explain` as a library | F2 shipped |
| **F4** | `bellpull` | — | `execa`, `cross-spawn`, `which` graded; a result with a static projection | **the `tinyexec` re-check below** |

**Why `linegauge` first, when `seniority` is the biggest layer.** Three reasons, in order:
`flagstaff` is scheduled now and needs width, so the code gets written in F1's window either
way (Y2 makes publishing it nearly free); it is the only one of the four with **no external
API risk** — six pure string functions, no process, no filesystem, no child; and it carries
the most legible proof of the whole thesis, the grapheme table, which is a screenshot rather
than an argument.

**When `seniority` moves to F1.** One criterion, recorded so it is a decision rather than a
mood: if the commander scoreboard goes public and **the visibility lane needs a headline
bigger than a width function**, `seniority` swaps with `linegauge`. It is the cheapest of the
four to start — `packages/burgee/src/precedence.ts` is 153 shipped lines of exactly its core —
and 1.81 B/wk is the number that reads in a title. Nothing else re-orders.

**The `tinyexec` re-check, as a gate with a number.** Before F4 opens, re-measure
`tinyexec`'s weekly downloads and its last publish date. If it has grown and is actively
maintained, `bellpull` ships **only** if executable resolution (`which`, 290 M/wk) plus
`npm-run-path` (104 M/wk) plus a projectable result is still a position nobody holds. If
`tinyexec` has absorbed resolution, F4 is dropped and the stub is deprecated with a README
pointing at `tinyexec`. That is a real outcome, not a formality: the weight pitch in this
layer is already taken, and being the third-best answer is worse than not answering.

### Where the shared `Runtime` type lives

Resolved: **each package declares its own structural type, inline, and there is no fifth
package.** Y9's shape is three optional fields (`env`, `isTTY`, `cwd`); a package of types
would be a dependency in every tarball to save nine lines. The lock is a test in this
umbrella's directory that reads all four `dist/` outputs and asserts the declared shapes are
structurally identical, so drift fails CI instead of being discovered by a user.

### The override recipe, and where it is published

The mechanism that actually shrinks a stranger's tree, and the reason Y3 constrains the
default export:

```json
{
  "overrides": {
    "string-width": "npm:linegauge@^1",
    "strip-ansi": "npm:linegauge@^1",
    "wrap-ansi": "npm:linegauge@^1",
    "signal-exit": "npm:closeout@^1"
  }
}
```

Measured on a two-dependency fixture, an alias override replaced the package transitively
and took its dependencies with it: **10 packages → 8**. On this repo's own tree the four
layers cover **41 replaceable copies and 1.58 MB, collapsible to 4 packages**. That is the
B4 row worth publishing, and it inverts the pitch from *"install one more"* to *"install
one, remove the dozen it stands in for."*

The recipe ships on the docs site per package, **behind its pass rate**, and CI refuses the
page when the rate is below its recorded baseline.

### File layout

```text
packages/<name>/src/
  <the layer's modules, one per subpath>
  runtime.ts              the structural Runtime shape, nine lines, no import
  *.test.ts               per-module
  differential.test.ts    fast path vs slow path over the corpus            (Y11)
  weight.test.ts          the ceiling from Y8
  shape.test.ts           zero deps, ESM + default condition, no process.*  (Y1, Y9)
.sdlc/bands/
  foundation-ceilings.json    one baseline per package, ratcheted
```

## Verification

- `npm test -w linegauge -w seniority -w bellpull -w closeout` — per-package units, the
  differential locks (Y11), the weight ceilings (Y8), the shape locks (Y1, Y9).
- `npm run compat -- string-width wrap-ansi strip-ansi slice-ansi signal-exit exit-hook cosmiconfig lilconfig dotenv rc execa cross-spawn which`
  — thirteen rows, `--control` first, ratcheting (Y7).
- `npm run bench -- --foundation` — the B4 rows and **the override-collapse row**, which is
  the one number this umbrella exists to produce.
- **The check that would have caught the original problem.** The original problem is that
  zero dependencies was claimed as a user benefit while this repo's own tree carried six
  copies of `string-width`. The check is a test in `cli-benchmarks` that walks the installed
  tree, counts copies of every incumbent in `replacement-map.md`, and **fails when the
  published override recipe would not collapse them** — so the claim and the tree cannot
  drift apart again. It fails today, on purpose, and is the F1 exit condition.

## Rejected alternatives

- **Taking the format parsers** (`js-yaml`, `json5`, `yaml`, `ini` — 747 M/wk). The single
  biggest number available in this research, and out of scope anyway: a YAML parser is a
  different family under rule 10, maintained on a spec's cadence rather than a CLI's, and
  owning one would make every config-layer release wait on it.
- **Taking the discovery plumbing as products** (`find-up`, `locate-path`, `p-locate`,
  `path-exists` — 809 M/wk). They are the best evidence in the file and the worst products:
  file discovery is not CLI-specific — bundlers, linters and test runners use it too — so
  owning them means serving four audiences we have no edge with. They become thirty lines
  *inside* `seniority` and stay a quotable statistic, not a package.
- **A fifth package for the shared `Runtime` type.** A dependency in four tarballs to save
  nine lines, and it would violate Y1's own spirit. Replaced by the structural-identity lock.
- **`burgee` importing `seniority` for precedence.** It would make the engine's zero-dep
  claim conditional on four more packages and reverse Y1. burgee keeps `precedence.ts`; the
  two share a test-vector file, exactly as `roundel` and `burgee` share contrast vectors.
- **Ordering by layer size.** It would put `seniority` first and `linegauge` third, which
  would have `flagstaff` write and then delete `src/width.ts`. Recorded because size is the
  obvious ordering and it is wrong here.
- **Publishing all four at once for the announcement.** Four unproven pass rates on one day
  is four times the surface for the first bug report, and the scoreboard's persuasive power
  comes from a number that moves, not from a launch.
- **Defending a layer the platform absorbs.** Y4 makes deprecation the planned response.
  Three candidates have died to this test — a `patch-package` replacement to npm RFC 53, a
  standalone glob matcher to `fs.glob`, and human formatting to `Intl.NumberFormat` and
  `Intl.DurationFormat` on 2026-09-09 — and the discipline that killed them cheaply is the
  same one that must apply to a package we have already published.

## Out of scope

- **Any new layer beyond these four.** Human formatting (`ms`, `bytes`, `pluralize`,
  `pretty-*` — 698 M/wk) died to Y4 on 2026-09-09: Node 24 substitutes outright for the
  format direction, and what survives is three functions across five packages that carry
  one dependency between them, so there is no tree for an override to collapse. Environment
  detection folds into `roundel`, `open` folds into `bellpull`, and file watching is a
  different family under rule 10. The ceiling for this repo is nine packages, set by the context budget
  (28,345 lines / ~116 K tokens today, before four of the eight are implemented).
- **A native port of any of these layers.** The 2026-09-08 decision stands: an addon's load
  cost exceeds the work any of these does in one CLI run. The one measured exception —
  long-lived processes reacting to OS events — is file watching, which is out of scope above.
- **A CLI in any of the four packages.** They are libraries. `burgee` owns the command line.
- **Windows-specific subprocess quirks beyond what `cross-spawn`'s suite grades.** If its
  suite passes, the quirk is covered; if it does not, that is a scoreboard row, not a
  separate design.
