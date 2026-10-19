# Intent — The output stack: a plugin framework for what a CLI shows, in layers that ship separately

> Stage 1 artifact. Umbrella for [`roundel`](../roundel/intent.md) and
> [`flagstaff`](../flagstaff/intent.md); [`caique`](../caique/intent.md) becomes
> its third child. Child of [`burgee`](../burgee/intent.md).
> Proposes floor additions U1–U8. Opened from the 2026-09-07 discussion on whether to ship
> a chalk alternative.

**Status:** approved · **Opened:** 2026-09-07 · **Owner:** @ofri-peretz · **Approved:** 2026-09-08 by the owner, in session ("remove all blockers")
**Restated:** 2026-10-18 — see § Restated 2026-10-18

---

## Restated 2026-10-18

**This umbrella closes through its children: every row is held on main with a check or moved to the child that owns it, except three unowned rows. REMAINING: R2 env-name single-file lock unbuilt, R12 no-burgee README opening unlocked, S2 complete-CLI dependency-bill row unbuilt.** *2026-10-19: R2 held by `scripts/output-env-lock.test.ts` (D-20261019-output-env-lock-scope); R12 and S2 remain, so the status stays `approved`.*

Read on `main` at `1013b65db5` (2026-10-18). No test was run; every check below was located on
that commit by file and test name. The requirement rows R1–R15 are mapped in
[`spec.md` § Restated 2026-10-18](./spec.md#restated-2026-10-18); this section maps the eight
success criteria, numbered S1–S8 in the order they appear under `## Success criteria`. A child's
success criteria are cited the same way: `flagstaff` S1 is the first bullet of
[`flagstaff/intent.md`](../flagstaff/intent.md) `## Success criteria`, and `flagstaff`
Constraint 7 is item 7 of its `## Constraints`. Nothing below is deleted: each original criterion
keeps its text, and the `## Verified against main — 2026-09-09` section stays as the record it
was.

| ID | promised | on main | check | disposition |
| :-- | :-- | :-- | :-- | :-- |
| S1 | three packages install from their tarballs, one file each (U7) | all three, and `caique` now has its own `shape.test.ts` (it had none on 2026-09-09) | `packages/roundel/src/shape.test.ts`, `packages/flagstaff/src/shape.test.ts`, `packages/caique/src/shape.test.ts` › "the user authored exactly one file, and never ran a build" | held via `roundel` R10, `flagstaff`, `caique` |
| S2 | `cli-benchmarks` publishes the complete-CLI dependency bill, burgee's column 0 | per-package install counts only: `benchmarks/install-graph.json` (`npm i burgee` installs 6 packages, all in-family). No row compares a burgee-stack CLI with commander + chalk + ora + cli-table3 + inquirer, and "0" is restated to "0 external" (D-111) | `scripts/install-graph-lock.test.ts` › "installs nothing from outside the family" holds the restated burgee column; nothing holds the comparison | remaining (no child owns it) |
| S3 | every façade in the metrics table vendored, `--control`-proven, ratcheting (U11) | chalk 59 / 59 (6.0.1), picocolors 1 / 1 (exit-code mode; and `roundel/picocolors` exists, D-20261011-roundel-picocolors), ora 99 / 99, log-update 99 / 99, boxen 213 / 213 (9.0.0), cli-table3 29 / 29, each in `packages/compat-oracle/baseline/<host>.json` | `.github/workflows/compat.yml` job "Ratchet · each host's suite against burgee"; `packages/compat-oracle/src/gate.test.ts` › "fails a known-good implementation that is one case short of its own suite" | held via `roundel` R6, `flagstaff` R6 |
| S4 | chalk subpath at or under picocolors' bytes and spawn delta; spinner subpath at or under ora's; both rows on the benchmarks page | restated by `roundel` R8: `./tokens` is held to picocolors' bytes, `./chalk` to chalk's own bytes, and both to picocolors' spawn + 10 ms (D-20260930-roundel-r8-spawn-bar). `flagstaff/spinner ÷ ora` is a gated B4 ratio. Both rows are on `apps/docs/content/docs/benchmarks.mdx` (the 2026-09-09 404 is gone) | `benchmarks/ratchet.test.ts` › "B2 cold start — roundel R8, the paired-delta gate over picocolors" and › "B4 weight — the "lighter than what it replaces" ratio gate"; `packages/roundel/src/weight.test.ts` › "stays inside its byte budget" | restated, held via `roundel` R8, `flagstaff` R10 |
| S5 | five conformance cases in `examples/` for a third-party JSON spinner | the five behaviours are asserted in-package, not in `examples/` | `packages/flagstaff/src/cli.test.ts` › "prints the plugin in all five modes side by side and exits 0"; `packages/flagstaff/src/plugin.test.ts` › "R2 · a contribution without a static projection is refused" | moved → `flagstaff` S1 (its text names the five plugin conformance cases) |
| S6 | every package's Z1 test and size ratchet on every PR | all three packages have `shape.test.ts` and `weight.test.ts`; tests and `check:artifacts` run in `quality-full.yml` on every non-draft PR (a draft without `run-full-ci` skips it) | `scripts/artifact-size-ratchet-lock.test.ts` › "runs check:artifacts in quality-full.yml's build job" | restated (every non-draft PR), held |
| S7 | root `{ spinner }` bundles within 5% of `./spinner`; CJS `require()` of every entry | stricter than written: every same-binding root/subpath pair across the family (at least 25) must be equal to the byte; every code entry carries `types`/`import`/`default` | `scripts/tree-shake-fixture.test.ts` › "a root named import costs what the subpath import costs (U10)"; `scripts/package-shape-lock.test.ts` › "exposes types, import and default on every code entry, so CommonJS can require() it (K2)"; each `shape.test.ts` › "is consumable from CommonJS too — the same ESM file, through require(esm) (K2)" | restated (equal, not ±5%), held |
| S8 | the U9 eval runs weekly in `evals/` | the cron (`20 5 * * 4`) and the case exist; three recorded runs at 10 / 10 (2026-10-08, and two dispatched 2026-10-09, D-20261009-burgee-1-0-evidence). The 2026-10-15 record (`evals/history/2026-10-15-29362dc-38717342918.json`, 0 / 11, `model: null`) is a run that never executed (the Claude usage limit), not a failure, so there is no current reading | `.github/workflows/evals.yml` schedule; `evals/cases/flagstaff-plugin-from-schema.json` | moved → `flagstaff` S7 (its text names this eval) |

**What changed since this file was written, and where it is recorded.**

- **The dependency arrows were reversed.** The design put `burgee` at the bottom with no
  dependencies; the tree puts it at the top, and `packages/burgee/package.json` depends on
  `bellpull`, `closeout`, `linegauge`, `roundel` and `seniority`. The output stack is reached
  only through guarded `import()` (U13, restated by D-136). Recorded in `burgee/spec.md` U1
  (D-130) and in the `FAMILY_ORDER` comment of `scripts/package-shape-lock.test.ts`. The
  sentence under *Affected users* that `packages/burgee` "is not changed to depend on either" is
  therefore false for `roundel`.
- **caique does not depend on flagstaff.** `packages/caique/package.json` declares `closeout`,
  `linegauge`, `paratext` and `roundel`, which its `shape.test.ts` asserts.
- **The adopter half of U12** ("the first adopter installs a layer alone") was taken out of every
  release gate by D-20261009-burgee-u12-1-0 and is tracked as `.sdlc/gaps/C3.md`. R12, the spec
  row, never contained it.
- **inquirer** in the metrics table and in R11 is now `@inquirer/prompts`, graded at 100 / 213
  (`packages/compat-oracle/baseline/inquirer-prompts.json`); the seven unbuilt prompts are owned
  by `inquirer-prompts-drop-in` R3.

## What is wanted

burgee is the framework for CLI tooling, and the plugin API is the product (lineage: Vite).
Today that is true of the parser and the manifest and false of everything a CLI *shows*:
colour, spinners, progress, tables, boxes, prompts. Those come from a dozen packages that
each detect the terminal on their own, disagree with each other, and have no plugin surface.

Once this lands:

- What a CLI shows is a stack of **separately published, zero-dependency packages**, one per
  layer, each importable in one file with no build step (Z1 holds per package).
- **Anyone can publish a plugin** — a theme, a spinner, a character, a progress style, a
  component — as plain data that the render layer hosts. The built-ins ship as the same
  shape a third party would publish.
- Every plugin is **agent-safe and screen-reader-safe by construction**: a contribution
  that cannot state what it looks like when nothing is animating is refused at registration,
  not discovered in a CI log full of carriage returns.
- Weight is **conditional**: importing one capability costs that capability and nothing
  else, and no subpath is heavier than the lightest incumbent it replaces.
- **We do not maintain creativity.** The stack ships a few defaults and a contract. The
  contract is small enough, and documented in a form an agent reads, that a user tells
  their agent "add a nyan-cat spinner" and gets a one-file plugin that validates, renders
  in every mode, and shows up wherever the stack draws. Advanced CLI features are reached
  by integrating, never by building from scratch.
- **Integration is whole-stack.** One `register()` and the theme reaches the help
  renderer, the spinner reaches prompts, the task events reach `--json`. A plugin never
  wires itself into three places.

A chalk alternative is not the product. `roundel` ships a chalk façade as one subpath, the
way `burgee/commander` is a façade over the engine — an on-ramp, graded by chalk's own
tests, not a reason to switch.

## Why now

- **The incumbents disagree about the terminal.** chalk asks `supports-color`, ora asks
  `is-interactive`, clack asks `is-ci`; on the same stream they give different answers
  (clack #286). burgee's `Runtime` already owns `isTTY` and the `NO_COLOR` / `FORCE_COLOR`
  logic, so one decision point exists and nothing above the parser uses it yet.
- **Live redraws are captured verbatim by agents and screen readers** (clack #585, #510).
  No incumbent component has a static projection; each is imperative. This is the same gap
  the manifest closes for `--help`, one layer up.
- **The dependency bill of a finished CLI is the number nobody publishes.** burgee's zero
  deps covers the parser; a user who wants colour, a spinner and a table installs the dozen
  anyway. The claim is only honest if the stack is zero-dep end to end, and it is only
  competitive if it is not heavier. Measured 2026-09-07, this machine, best of 11 spawns
  over bare node (30 ms): chalk 5.6.2 **+18 ms, 16.7 KB** of JS; picocolors 1.1.1
  **+10 ms, 3.3 KB**. Those are ceilings, not targets.
- **Node 24 has the primitives.** `util.styleText`, `util.stripVTControlCharacters`,
  `readline` cursor control, `stdout.columns`. The dozen exist because these did not.

## Affected users and systems

- New packages under `packages/`, all in this one repo so an agent's context holds the
  whole stack, each marketed and measured as its own product (U12): **roundel** (tokens,
  theme, policy, chalk façade) and **flagstaff** (frame loop, static projection, plugin host,
  built-in components); `caique` becomes **caique**. Names are candidates, below.
- `packages/burgee` is **not** changed to depend on either. Its help renderer keeps its
  own `styleText` calls and exposes a theme seam.
- `caique` re-parents here, takes `flagstaff` and `roundel` as same-repo dependencies, and
  drops `@clack/prompts` entirely: it implements prompts itself and offers `caique/clack` and
  `caique/inquirer` as graded migration paths (U6, U11).
- `cli-benchmarks` B4 grows a per-subpath row and a new published number: **total
  runtime dependencies of a complete CLI**, burgee stack against commander + chalk + ora +
  cli-table3 + inquirer.
- `burgee/spec.md` gains U1–U8.

## Constraints

Floor additions, proposed. Each is a lock or a band, never a principle.

| id | Requirement | Evidence | Kind |
| :-- | :-- | :-- | :-- |
| U1 | One package per layer; dependency arrows point up only. `burgee` never imports a UI package. A stack package may depend on a lower stack package **from this repo**; nothing else | listr2 #771, #708, #676; ora #234 — the cost of layers coupled by adapters and peer ranges; the arrow direction is a decision, not a finding | lock |
| U2 | Output policy is decided once, from `Runtime`, as one of `tty \| pipe \| json \| accessible \| ci`. Every component reads it; none detects the terminal itself | picocolors #100, #85; chalk #624, #614 (declined); cli-table3 #357, #180; listr2 #687, #716; clack #286; ora #218, #235 (declined); ink D#577 | lock + L |
| U3 | Every styled or animated output has a **static projection** — what it is when nothing moves. A component or plugin without one is rejected at registration | clack #585, #510, #533; ink D#734; Inquirer D#1356, D#1699, #1783; ora #116; log-update #59 (declined); listr2 #732, #716 | lock |
| U4 | **Plugins are data.** A plugin is an object inspectable without execution: tokens, frames, glyphs, components. At most one optional frame function | chalk #666 (declined), #677, #659; clack #36, #345, #379; ora #255, #240; boxen #106, #99, #94; cli-table3 #352, #355; ink D#641; lineage: ESLint flat config | lock |
| U5 | **Conditional weight.** Every capability is its own subpath (K6). A subpath imports only itself and the policy module. Per-subpath import cost is ratcheted, and its ceiling is the lightest incumbent for that capability | ink #976 (a DEV-only path installed for everyone); picocolors #70 ("doubling the package size"); chalk #617 (README is 25% of the tarball); chalk +18 ms, picocolors +10 ms | lock + B4 |
| U6 | **Zero external runtime dependencies** in every package; the only allowed dependencies are packages published from this repo. Every published number says "0 external" and lists the same-repo closure beside it | ora #229, #247; chalk #656, #685; ink #976, #978; listr2 #759, #724, #707, #726, #771; log-update #65; cli-table3 #356; K1, K3 | lock |
| U7 | Every package has its own Z1 shape test and K5 size ratchet | cli-table3 #357 (npm and `master` disagree), #356; ora #229 (an install shape that segfaults); Z1, K5 | lock |
| U8 | **No layout engine.** Box, columns and a status line are the ceiling. The day a plugin needs flexbox, that is a recorded decision, not a feature | ora #231 (declined: "try Ink"); ink #765, #222, #676, #660, #870, #251, #834, #978, D#555, D#959 | lock |
| U9 | **Agent-authorable.** The plugin contract is published as a JSON Schema and in `llms.txt`; one file with no build step is a complete plugin; `burgee plugin check <file>` validates it and prints its rendering in every U2 mode. The eval: an agent given the schema and one example produces a passing plugin in one turn | clack #533, #525; Inquirer D#1699; ink D#776 — agents driving and inspecting CLIs; the one-turn eval is unmeasured; F-series schema infrastructure | hypothesis → lock once measured |
| U13 | **burgee's optional surfaces use the family without depending on it.** `burgee dev`, `--interactive` and any spinner or prompt inside burgee's own CLI reach `flagstaff` and `caique` through a dynamic `import()` guarded by presence, and fall back to the static projection when absent. `import 'burgee'` never resolves a family specifier; the weight lock denies them for entry `.` | ink #976 (an optional path that costs every install); ora #229 (a spinner dependency taking the whole CLI down); Z3 and U1 must both hold | lock (weight.test `denied`) |
| U12 | **Each layer is an independent product.** Its README leads with its own problem and its own comparison table against its own incumbents, never with burgee; it has its own docs section, its own benchmark and scoreboard rows, and is installable and useful with no other layer present beyond its same-repo dependency. Integration with burgee is documented on burgee's side as a feature of burgee. A layer that only makes sense next to burgee has failed this row | no issue; supported only by the download spread in the landscape table (chalk 440M/wk to ink 5.8M/wk, each chosen separately) | hypothesis → lock once measured |
| U11 | **Every incumbent the stack replaces gets a façade graded by its own suite.** Vendored into `compat-oracle`, `--control` proves the gate against the real package first, pass rate published and ratcheting (C1–C6). "ora-compatible" is a number on the scoreboard, never a sentence in a README | picocolors #100, #92 ("regressions when projects migrate from chalk"); listr2 #676; Inquirer D#1782, D#1471; clack #551, #553, #555, #556, #557; C1–C6; the commander move, repeated | lock + band |
| U10 | **Both module systems, and tree-shaken.** Every package is ESM with a `default` condition consumed by `require(esm)` (K2), `sideEffects: false`, no side-effectful barrel; bundling one named import from the root entry costs the same bytes as importing its subpath directly (B4 R7 fixture) | picocolors #70 (35 reactions), #50, #59; chalk #632, #633, #641, #628, #627, #620 (declined, every one), #613, #661, #626; ora #239 (declined); listr2 #755, #745; Inquirer D#1270, D#1206; K2; B4 | lock + B4 |

Issue ids are from [what 230 issues say about the output stack](../../research/output-stack-open-issues.md),
whose closing table has one row per U id. Two rows are hypotheses until measured: **U9**
locks when the weekly one-turn authoring eval reaches the pass rate it states (proposed: 9
of 10 runs, three consecutive weeks); **U12** locks when the independence install test
passes for every layer and the first adopter installs a layer alone, without burgee.

Unchanged: Z1–Z5, K1–K6, O3–O4, P1–P3, the H rows. Nothing here moves a published number
down.

## Metrics — us against the landscape

Every row is a published number with a measurement behind it (B7), and every one must read
better than the incumbent before the package publishes. Cells read *recorded when vendored*
until the bench workspace carries that incumbent; a number typed from memory is a slogan.

| Incumbent | Our façade | Compatibility (own suite) | Spawn delta | Bundled KB | Runtime deps |
| :-- | :-- | :-- | :-- | :-- | :-- |
| chalk 5.6.2 | `roundel/chalk` | ratchets from first vendor | ≤ picocolors' +10 ms | ≤ 3.3 KB | 0 (chalk: 0) |
| picocolors 1.1.1 | `roundel/tokens` | — (no API to grade) | ≤ +10 ms | ≤ 3.3 KB | 0 (0) |
| ora | `flagstaff/ora` | ratchets from first vendor | recorded when vendored | recorded | 0 (ora: recorded when vendored) |
| log-update | `flagstaff/frame` | ratchets from first vendor | recorded | recorded | 0 |
| boxen | `flagstaff/box` | ratchets from first vendor | recorded | recorded | 0 |
| cli-table3 | `flagstaff/table` | ratchets from first vendor | recorded | recorded | 0 |
| **a complete CLI** | the stack | — | sum of subpaths used | sum | **0** vs commander + chalk + ora + cli-table3 + inquirer |

Two axes no incumbent can score on, reported beside the table: the static-projection
conformance cases (U3) and the one-turn agent authoring eval (U9).

~~Not planned, on purpose: **Ink**~~ **Ink is planned, restated 2026-09-27 by the owner (D-158):** a tenth package, [`controlroom`](../controlroom/intent.md), whose native API has no React and no layout engine, plus `controlroom/ink`, a drop-in graded by Ink's own suite. The reason recorded here still holds — compatibility means React — which is why React stays the user's optional peer, reached only by that subpath, and never a dependency (U6); U8 stays flagstaff's ceiling. Not planned, on purpose: **listr2** (a task framework whose surface
is larger than the rest of this table combined; `flagstaff`'s task list covers the common
case and a listr2 façade is its own intent if an adopter asks).

## Success criteria

- Three packages install from their tarballs into a temp dir, one file each, and run (U7).
  **S1, 2026-10-18:** held.
- `cli-benchmarks` publishes the complete-CLI dependency bill, and burgee's column reads 0.
  **S2, 2026-10-18:** remaining; "0" restated to "0 external".
- Every façade in the metrics table has a vendored suite, a `--control` run that proves the
  gate, and a pass rate on the scoreboard that only ratchets up (U11).
  **S3, 2026-10-18:** held.
- The chalk façade subpath measures at or under picocolors' bytes and spawn delta; the
  spinner subpath at or under ora's. Both rows are on the benchmarks page (B7).
  **S4, 2026-10-18:** restated to `roundel` R8's bars; held.
- A third-party spinner published as a JSON object renders on a TTY, prints one line per
  state on a pipe, emits one event under `--json`, and is refused if its `static` field is
  missing — five conformance cases in `examples/`.
  **S5, 2026-10-18:** moved → `flagstaff` S1.
- Every package's Z1 test and size ratchet run on every PR.
  **S6, 2026-10-18:** restated to every non-draft PR; held.
- The tree-shake fixture for `{ spinner }` from the root entry bundles to within 5% of
  the `./spinner` subpath, and `require()` of every entry loads in a CJS smoke (U10).
  **S7, 2026-10-18:** restated to equal bytes; held.
- The U9 eval runs weekly in `evals/`: one turn, schema plus one example, a passing plugin.
  **S8, 2026-10-18:** moved → `flagstaff` S7.

## Verified against `main` — 2026-09-09

Superseded on 2026-10-18 by § Restated 2026-10-18 at the top of this file; kept unchanged as the
record of that day. Several figures below have since moved (chalk 59 / 59 at 6.0.1, boxen
213 / 213 at 9.0.0, `caique` has its shape and weight tests, the benchmarks page exists).

Checked criterion by criterion on `61bd11b9`. **Zero of eight met.** The status stays
`approved`, which is the Design→Build gate the owner passed on 2026-09-08 and nothing more;
these criteria are the acceptance bar for `shipped`, and the umbrella is a long way from it.

- **Three packages install from their tarballs into a temp dir, one file each (U7)** — two of
  three. `roundel/src/shape.test.ts` and `flagstaff/src/shape.test.ts` do it; `caique` has no
  `shape.test.ts` at all.
- **The complete-CLI dependency bill, burgee's column reading 0** — not met, and not startable:
  there is no `benchmarks/` directory and no `bench` script. `scripts/control-bands.ts` already
  reads `benchmarks/results/<suite>/`, a path that has never existed.
- **Every façade vendored, `--control`-proven and ratcheting (U11)** — four of eight. chalk,
  ora, log-update and boxen are vendored, each with a control in the same run and a
  `packages/compat-oracle/baseline.json` entry. picocolors, cli-table3, inquirer and clack have
  no vendored suite.
- **The chalk subpath at or under picocolors' bytes, the spinner at or under ora's, both rows on
  `/benchmarks` (B7)** — half met. The bytes are measured and locked (`roundel/tokens` 3,258 B
  against a 3,300 B ceiling; `roundel/chalk` 9,311 B against 9,370 B; `flagstaff/spinner`
  12,418 B against 12,500 B). The spawn delta is unmeasured and
  `https://burgee.interlace.tools/benchmarks` returns **404** — there is no page to put a row on.
- **Five conformance cases in `examples/`** — not met where the criterion puts them.
  `examples/conformance/` imports none of the three packages; the five modes are asserted as
  package unit tests (`flagstaff/src/loop.test.ts` "R1 · one component, five modes",
  `plugin.test.ts` "R2 · a contribution without a static projection is refused").
- **Every package's Z1 test and size ratchet on every PR** — not met twice over. `caique` has
  neither a `shape.test.ts` nor a `weight.test.ts`; and the every-PR gate (`quality.yml`) runs
  lint only — tests are in `quality-full.yml`, which skips draft PRs without `run-full-ci`.
- **The tree-shake fixture within 5% of the subpath, and a CJS `require()` smoke (U10)** — half.
  No bundler fixture and no 5% assertion exists anywhere; only `sideEffects: false`. The CJS
  smoke exists for `burgee`, `roundel` and `flagstaff`, not for `caique`.
- **The U9 eval weekly in `evals/`** — not met. The cron (`20 5 * * 4`), the case and the
  discriminating red/green proof are all real, but `evals.yml` has **never run on `schedule`**,
  and every PR run prints `Layer 2 — skipped: no credential`. No result has ever been recorded.

## Open questions

Decided — none open. The items below were settled when this intent was written and are
kept as the record they always were (confirmed 2026-09-20, D-072).

- Decided: **Published names — candidates 2026-09-07, pending owner sign-off.** Compounds
  (`burgee-style`) were rejected the same day: each layer is its own product (U12) and a
  prefix says the opposite. Chosen the way `burgee` was — the vocabulary of flags and the
  rigging that flies them, timeless, standalone, one pronunciation, free on npm that day:

  | Layer | Candidate | Meaning | Load-bearing because |
  | :-- | :-- | :-- | :-- |
  | style | **roundel** | a flag's colours carried onto another surface: an aircraft wing, the Underground sign | a theme is a CLI's colours carried onto the terminal; one of the most recognised shapes in the world, and its own logo |
  | render | **flagstaff** | the staff a flag flies from | the place the flag is seen; a plugin is a flag flown from the same staff; the static projection is the flag with no wind |
  | prompts | **caique** | a small, loud, never-silent parrot; and the light boat that runs between ship and shore in the Aegean and the Bosphorus | the one that always answers back and never hangs (P2); the go-between that carries a question out and the answer in; the family's one character |

  Chosen 2026-09-08 after a second search against the bar `flagstaff` set — a word people
  already know that means the exact thing, free with every variant, no live neighbour. `pennon`
  (first choice, published 0.0.1, unpublished inside the 72-hour window) lost to `roundel` on
  recognisability and on having a built-in mark; `answering` (same) lost to `answerback` on being
  a noun with a precise meaning; `answerback` then lost to `caique` (2026-09-08) on character: the
  package that talks to a person should be the one with a face, and a parrot is the creature
  defined by answering back. Honest note: caiques are vocal, not eloquent — the README says
  "answers back", never "talks". Parrot names rejected: `alexandrine` (four syllables, reads as a
  person), `greyparrot` (truest meaning, a description not a name), `captainflint` (a joke as a
  name); `parrot`, `polly`, `macaw` and every common species are taken. Rejected in that search: `umber` (amber is live, one letter away),
  `colourway` (colorway is taken; a US/UK split is the invokable mistake), `rollcall` and `ayeaye`
  (their hyphenated forms are taken, so npm refuses them).
  Earlier record: `pennant` is a live package (2024), a different word, a verbal near-miss. `halyard` was the first choice and npm refused it on 2026-09-08: "too similar to existing
  package Halyard", the 2017 unpublished record; npm treats case and punctuation variants as one
  name, so an unpublished record blocks forever. `yardarm` was the interim pick; **`flagstaff`** was
  chosen 2026-09-08 — the plainest word for the place a flag flies, free with every variant, and
  read correctly on sight by anyone. Its one cost is Flagstaff, Arizona owning the word in web
  search; the README earns the meaning. `masthead`, the ideal, is taken.  Runners-up, all free: oriflamme and
  vexillum (style), figurehead (render; a perfect fit for character plugins, rejected for its
  everyday meaning), hailer (prompts; shouts rather than asks); `pennon` and `answering`, the first picks. Stubs: npm's similarity rule guards `flag-staff` and `flag_staff` automatically; `flagstaffs`
  optional. The `burgee-*` compounds so nobody squats them.
- Decided: **Where the policy module lives.** U2 needs one decision point that `roundel`,
  `flagstaff` and `caique` all read. Candidates: a fourth tiny package, or a subpath
  of `roundel` that the others peer on. Decide in `roundel/spec.md`; the constraint
  is that it costs the chalk façade nothing it does not already need.
- Decided: **Sequencing against the scoreboard.** No package of the stack publishes before
  `burgee/commander` publishes its pass rate. A second product before the first has a
  number splits the repo's credibility.
