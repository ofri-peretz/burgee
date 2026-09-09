# Design — The foundation stack

Intent: [`intent.md`](./intent.md). **Status:** draft.

Children: [`linegauge`](../linegauge/design.md) · [`seniority`](../seniority/design.md) ·
[`bellpull`](../bellpull/design.md) · [`closeout`](../closeout/design.md).

---

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
  Two candidates already died to this test — a `patch-package` replacement to npm RFC 53,
  and a standalone glob matcher to `fs.glob` — and the discipline that killed them cheaply
  is the same one that must apply to a package we have already published.

## Out of scope

- **Any new layer beyond these four.** Human formatting (`ms`, `bytes`, `pluralize` —
  714 M/wk) is measured and live but is a separate intent; environment detection folds into
  `roundel`, `open` folds into `bellpull`, and file watching is a different family under
  rule 10. The ceiling for this repo is nine packages, set by the context budget
  (28,345 lines / ~116 K tokens today, before four of the eight are implemented).
- **A native port of any of these layers.** The 2026-09-08 decision stands: an addon's load
  cost exceeds the work any of these does in one CLI run. The one measured exception —
  long-lived processes reacting to OS events — is file watching, which is out of scope above.
- **A CLI in any of the four packages.** They are libraries. `burgee` owns the command line.
- **Windows-specific subprocess quirks beyond what `cross-spawn`'s suite grades.** If its
  suite passes, the quirk is covered; if it does not, that is a scoreboard row, not a
  separate design.
