# Design — `cli-benchmarks`

Intent: [`intent.md`](./intent.md). **Status:** review.

---

## Requirements

| id | Requirement |
| :-- | :-- |
| B1 | Agent cost: tokens, turns and success per task, layer on vs off, median of N≥5 |
| B2 | Performance: cold start p50/p95 over ≥30 spawns, for bare node, each host, each host + layer, and the replacement |
| B3 | Compatibility: per-host pass rate, read from `compat-oracle`'s JSON, never recomputed |
| B4 | Weight: bundled KB of a fixture importing one entry point, per entry point, against its published target |
| B5 | All four axes emit `{ axis, variant, metric, unit, samples, median, p95 }`; one collector reads all of them |
| B6 | `npm run bench` runs every axis; `--axis <name>` runs one; B2/B3/B4 gate every PR, B1 runs weekly |
| B7 | Every public number in the repo or on the site links to the generated `/benchmarks` page |

Harness requirements:

- **R1** `benchmarks/tasks/<id>.json`: `{ id, prompt, setup: string[]
  (shell), check: string (shell, exit 0 = success), maxTurns }`.
- **R2** `axes/agent.ts --layer on|off --model <id> --runs N`: builds the demo into a temp
  `PATH` dir as `mytool`, then for each task and run spawns `claude -p <prompt>
  --allowedTools 'Bash(mytool:*)' --max-turns <n> --output-format json`, parses usage
  and tool-call counts, runs `check`, writes one results file.
- **R3** Results schema `benchmarks/results.schema.json`; `results/
  <date>-<model>-<layer>.json` committed by the workflow via PR (same pattern as
  eslint's benchmark results).
- **R4** `summary.ts` produces the before/after table (median per task, delta %) as
  Markdown and JSON; the docs site reads the JSON.
- **R5** Band wiring: the `benchmark-json` collector reads `median` from every axis
  record, so a new axis needs a band entry and no collector change.
- **R6** `axes/perf.ts` spawns each variant ≥30 times, discards the first (warm-up),
  reports p50 and p95, and always includes `bare node` as the floor row.
- **R7** `axes/weight.ts` bundles a one-import fixture per entry point with esbuild,
  minified, and reports the byte count — the number a user's bundle actually grows by.
- **R8** `axes/compat.ts` shells out to `compat-oracle` and re-emits its JSON in the
  common shape; it contains no compatibility logic of its own.

## Design

```
benchmarks/
  run.ts                  # dispatch: --axis agent|perf|compat|weight (default all)
  axes/
    agent.ts              # B1  spawns claude -p against the demo CLI
    perf.ts               # B2  spawns each variant >=30x, p50/p95
    compat.ts             # B3  reads compat-oracle's JSON
    weight.ts             # B4  esbuild-bundles a one-import fixture
  tasks/*.json            # B1 task set
  fixtures/*.ts           # B4 one import per entry point
  results/*.json          # committed by the workflow via PR
  results.schema.json
```

### B1 — agent cost

Five tasks, each chosen because a floor requirement is the only thing that changes the
agent's path:

| Task | Requirement that should move the number |
| :-- | :-- |
| discover-subcommand: "Using mytool, print the current user name from config" | F1 `--schema` vs a `--help` walk |
| set-and-confirm: "Set greeting to 'hi' and show me it took" | O1 envelope vs prose parsing |
| diagnose-provenance: "The greeting is wrong; find where its value comes from" | V3 `--explain` (until it lands, this task measures the cost of *not* having it) |
| recover-failure: "Run `mytool fail`; then make it succeed" | E2/E3: no help on failure, `fix` present |
| non-tty-required: "Greet without giving a name" in a pipe | P2/E3: error names the flag instead of hanging |

The plain build is the same demo with `withAgentLayer` skipped (`LAYER=off`), so the
only variable is the layer. Transcripts are kept under `results/transcripts/` and
`.gitignore`d except for one exemplar per task, which the article quotes.

### B2 — performance

Variants: `bare node`, `commander`, `commander + layer`, `yargs`, `yargs + layer`, and
later the replacement. Each is a one-subcommand CLI doing the same trivial work, spawned
as a process, because process time is what a user and an agent actually pay — an
in-process micro-benchmark of the parse function would measure the part that does not
matter.

The `bare node` row is mandatory (constraint 5): it was 29ms of a 50ms commander run when
measured on 2026-09-06, so a table without it would attribute Node's floor to the layer.
The banded number is *the layer's overhead over its own host*, not total time, because
that is the only part we control.

### B3 — compatibility

Reads `compat-oracle`'s emitted JSON and re-emits it in the common shape. No logic here:
two implementations of a compatibility rate produce two rates, and the honest one has to
be the one the oracle computed.

### B4 — weight

For each public entry point, a fixture that imports exactly that entry point and uses one
symbol, bundled minified with esbuild. The reported number is the bundle delta, which is
what a user's application grows by — a package tarball size answers a different question.

Targets come from `.sdlc/research/competitor-landscape.md` §6: core under cac's 52KB, core
plus one compat front-end under the host it replaces (commander 232KB, yargs 376KB). A
fixture importing only the core that pulls any front-end byte fails the axis, which is how
the pay-per-import rule is enforced rather than merely intended.

## Verification

- **Proven-red, per CLAUDE.md rule 4**: `benchmarks/ratchet.test.ts` feeds each axis a
  synthetic record one step worse than its band and asserts a non-zero exit, then a record
  at band and asserts zero. A budget that has never failed is not a budget.
- `run.ts` unit-tested with a stubbed `claude` binary (a shell script emitting a
  canned JSON) so the harness is deterministic in CI without a credential.
- A lock asserts every task has a `check` that fails on the un-run state.
- The workflow uploads results as an artifact and opens a PR with the JSON; the band
  watcher (intent 3) consumes merged results only.

## Rejected alternatives

- **Simulating the agent with a script.** Then the number measures the script. The
  point is a real model's behaviour on real output.
- **Measuring wall-clock.** Dominated by model latency; tokens and turns are what the
  layer can move.
- **Running B1 on every PR.** Cost and noise; weekly plus `packages/**` changes is the
  cadence, with `run-full-ci` for on-demand. B2, B3 and B4 are free and deterministic, so
  they do gate every PR — those are the ones a refactor regresses silently.
- **Four separate benchmark projects.** All four need the same thing: build N variants, run
  something per variant, emit one shape, compare to a band. Four projects would be that
  harness written four times and four docs pages to keep in sync.
- **Reporting a single blended "score".** A composite number cannot be acted on: nobody can
  tell whether a drop was compatibility or weight, and the fix differs entirely.
- **Measuring cold start in-process.** It would exclude Node startup, which is most of the
  real cost, and would flatter every number we publish.

## Out of scope

- Multi-model leaderboards; one band per model, and only one model in the band.
- Benchmarking CLIs outside the demo (interlace-ui, others) — later, once the harness
  is trusted.
- Comparing agent cost *across hosts* (commander+layer vs yargs+layer). The layer is the
  variable under test; host comparison is a different question and a different article.
- Memory and CPU profiling. Neither is a claim we make, and an unclaimed metric in a
  benchmark suite is a metric nobody maintains.

---

## Built 2026-09-09 — what the design says, and what the tree got

Five deviations, each because the design's wording predates something the repo decided
later or because building it exposed a way the number would have been wrong.

| Design says | Built as | Why |
| :--- | :--- | :--- |
| band `cold-start-p95-ms` | band **`cold-start-ratio`** | An absolute millisecond band is a band over which machine picked up the job: bare node is 32 ms here and 34 ms in the competitor map, and a GitHub runner differs by more than the effect being measured. The banded number is the median of *paired* ratios — round *i* of the front-end against round *i* of its host, interleaved — which cancels the machine out. Issue #27 red-lit two innocent PRs on absolute ceilings; this does not repeat it. |
| band `core-bundled-kb` | band **`core-bundled-bytes`** | A 400-byte regression is invisible once rounded to KB, and catching the accidental kind of growth is the entire job of a ratchet. |
| `demo-cli-commander` built twice, `LAYER=off` | the burgee demo against the **commander** demo | "The layer" stopped existing on 2026-09-06, when the repo decided to be the engine rather than a layer over commander. The honest off-state is the same program on commander: no `--schema`, no `{ ok, data }`, no provenance, help text on a runtime failure. Both bins already exist and the conformance suite already proves they behave identically where the floor does not apply. |
| `fixtures/*.ts`, one per entry point | one table, `fixtures/entry-points.ts`, and generated fixture source | Fourteen hand-written fixtures drift: our side ends up importing something slightly different from the incumbent's, and the two columns stop being comparable while still looking fine. `fixtures.test.ts` pins the generated source. |
| `results/<date>-<model>-<layer>.json` | `results/<suite>/<YYYY-MM-DD>.json` | That is the only shape `scripts/control-bands.ts` reads (`benchmarks/results/<suite>/` and a `^\d{4}-\d{2}-\d{2}\.json$` filename). The model is pinned inside the document instead, which is where a reader looks for it anyway. |

Two additions the design did not ask for:

- **A `claims` block in every results document.** The intent's success criterion — "the
  claim is either confirmed or rewritten with the measured number; a claim without a
  number is not acceptable" — cannot be met by a table of records that a reader has to
  compare against a research file by hand. Each claim names the file that states it, the
  record that settles it, and the verdict, and `unmeasured` never renders as `false`.
- **A deterministic gate per record, separate from the band.** A band needs eight
  observations before it says anything; B2, B3 and B4 gate every PR from the first one.
  The gate is a bound on the median with a mandatory `why`; the band watches drift below
  it.

### What the first run found

Measured on an Apple M4 Pro, 14 cores, Node 24.12, at `006fb1b` — full numbers on
`/docs/benchmarks`, and the cold-start column reproduces the competitor map's §2 table
(bare node 30–32 vs its 34, commander 47–48 vs 50, yargs 123–129 vs 118) closely enough
to trust the harness.

Twelve published claims are met. **Three are not**, and none of the three was known:

1. **The engine does not start at or below cac.** 1.37–1.47× across three runs.
   `replacement-parser` #2 and the scoreboard row both state it as a target; it is not one
   yet.
2. **`burgee/commander` bundles 1.50× commander** (58,458 B against 39,084 B). The
   published targets are written against the incumbent's *installed* size (232 KB) and are
   comfortably met — but "lighter than what it replaces" is not true of this entry point
   on the basis a user's bundler cares about. It is true of the other five façades, and a
   suite that published only those five would be lying by selection.
3. **Core bundles 3.33× cac** — which is a different claim from "under 52 KB", and that
   one is met at 34,841 bytes.

And one thing to hand to whoever owns the oracle: `results.json` reports yargs as
`tests: 803, passed: 804`, because the host's own TAP summary counts a case it skipped on
this OS as a pass. The rate is computed against `max(reference, tests)` so the arithmetic
is sound, but the 100% for commander and for yargs each contain one case that could not
have failed. This axis re-emits the oracle's own number, per constraint 8, and carries
`passed`, `tests`, `skipped` and `reference` in `detail` so the wrinkle is visible rather
than smoothed.

## Amended 2026-09-09 — a published measurement is not an observation

`benchmarks/results/<suite>/` was designed as one thing and read as two. The Stage 6 bands
want *every* observation, from every machine, because a series that stops updating looks
perfectly healthy. `/docs/benchmarks` and `/docs/comparison` want *one* measurement,
because a published figure is a claim somebody stands behind.

They collided the day the suite landed. The recorder ran on a two-core CI runner, wrote
`2026-09-09.json` over the committed one, and opened [#102]. Merging it would have demanded
`+8.0 ms` of `comparison.mdx` where the page states `+22.6 ms` — five assertions red — and,
had the page been updated to match, moved the project's public speed figures to whichever
box picked up the job. Nothing got faster. The `installed-bytes` rows were byte-identical
across the two runs, which is the point of them; the `cold-start-ms` rows were not, which
is also the point of them, and `perf.ts` says so in its own method line.

**The filename carries the distinction.** `YYYY-MM-DD.json` is a published measurement,
committed by a person. `YYYY-MM-DD-<sha>.json` is an observation from the run at that
commit. The bands read both; `bench-page.ts` and `docs.test.ts` go
through `publishedResults()` and read only the first. The recorder `mv`s its output aside
and restores the published file, so a CI run cannot change a public number without somebody
choosing to.

Two things about that were got wrong first and are worth keeping written down, because both
were green before they were right:

- **The first lock was vacuous.** It fixtured an observation from the *same* day, which
  sorts before its measurement by an accident of ASCII (`-` is 0x2D, `.` is 0x2E) and so
  passes under the old "whichever landed last" rule too. The case that happens is the next
  morning's run.
- **"The bands glob the directory and read both" was not true when it was written.**
  `collectBenchmark` and `collectFromGit` in `scripts/control-bands.ts` both matched
  `????-??-??.json` only, so the split created observations that nothing read: eleven of
  them landed while every band sat at one point against a `minPoints` of 8. Corrected
  2026-09-09. It is the worst shape a monitoring failure can take, because a band with too
  few points reports exactly what a healthy quiet band reports — the watcher looked like it
  was working the entire time.
- **The first recorder used `cp`.** On a date that has never been published the run writes
  a *new* `YYYY-MM-DD.json`, and `git checkout --` does not remove an untracked file — so
  the CI file was staged under the exact name reserved for a chosen measurement. Correct on
  day one, wrong on day two.

[#102]: https://github.com/ofri-peretz/burgee/pull/102
