# Intent — The output stack: a plugin framework for what a CLI shows, in layers that ship separately

> Stage 1 artifact. Umbrella for [`roundel`](../roundel/intent.md) and
> [`flagstaff`](../flagstaff/intent.md); [`caique`](../caique/intent.md) becomes
> its third child. Child of [`agent-native-cli-layer`](../agent-native-cli-layer/intent.md).
> Proposes floor additions U1–U8. Opened from the 2026-09-07 discussion on whether to ship
> a chalk alternative.

**Status:** approved · **Opened:** 2026-09-07 · **Owner:** @ofri-peretz · **Approved:** 2026-09-08 by the owner, in session ("remove all blockers")

---

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
- `agent-native-cli-layer/design.md` gains U1–U8.

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

Not planned, on purpose: **Ink** (a React reconciler; compatibility would mean shipping
React, which is the opposite of U6 and U8) and **listr2** (a task framework whose surface
is larger than the rest of this table combined; `flagstaff`'s task list covers the common
case and a listr2 façade is its own intent if an adopter asks).

## Success criteria

- Three packages install from their tarballs into a temp dir, one file each, and run (U7).
- `cli-benchmarks` publishes the complete-CLI dependency bill, and burgee's column reads 0.
- Every façade in the metrics table has a vendored suite, a `--control` run that proves the
  gate, and a pass rate on the scoreboard that only ratchets up (U11).
- The chalk façade subpath measures at or under picocolors' bytes and spawn delta; the
  spinner subpath at or under ora's. Both rows are on the benchmarks page (B7).
- A third-party spinner published as a JSON object renders on a TTY, prints one line per
  state on a pipe, emits one event under `--json`, and is refused if its `static` field is
  missing — five conformance cases in `examples/`.
- Every package's Z1 test and size ratchet run on every PR.
- The tree-shake fixture for `{ spinner }` from the root entry bundles to within 5% of
  the `./spinner` subpath, and `require()` of every entry loads in a CJS smoke (U10).
- The U9 eval runs weekly in `evals/`: one turn, schema plus one example, a passing plugin.

## Verified against `main` — 2026-09-09

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

- **Published names — candidates 2026-09-07, pending owner sign-off.** Compounds
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
- **Where the policy module lives.** U2 needs one decision point that `roundel`,
  `flagstaff` and `caique` all read. Candidates: a fourth tiny package, or a subpath
  of `roundel` that the others peer on. Decide in `roundel/design.md`; the constraint
  is that it costs the chalk façade nothing it does not already need.
- **Sequencing against the scoreboard.** No package of the stack publishes before
  `burgee/commander` publishes its pass rate. A second product before the first has a
  number splits the repo's credibility.
