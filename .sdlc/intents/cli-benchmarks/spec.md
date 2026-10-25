# Design — `cli-benchmarks`

Intent: [`intent.md`](./intent.md). **Status:** approved (2026-10-25).

**Restated:** 2026-10-18 — see § Restated 2026-10-18

---

## Design gate 2026-10-25

**Accepted for Build**
([D-20261025-cli-benchmarks-design-accepted](../../decisions/D-20261025-cli-benchmarks-design-accepted.md)).
B1–B6 and R1–R8 hold as restated. Two items are left.

**In scope.**

1. S4, the claim stated as a series. The public agent-cost row in `README.md` and
   `apps/docs/content/docs/comparison.mdx` states the token and turn ratios as the median and
   range over a named window of CI readings in `benchmarks/results/agent-cli-bench/*-ci.json`.
   It also states how many readings in the window met each bar. The row is generated from the
   results, never typed. `scripts/claim-table-lock.test.ts` is restated to check the row
   against the window it names, so a row quoting one run fails. `2026-10-09.json` stays as a
   dated record.
2. B7, the link lock. Every benchmark figure stated in `README.md`, `comparison.mdx` and each
   `packages/*/README.md` (a ratio with `×`, a byte count against an incumbent, a cold-start
   figure) sits in a paragraph or table row that links to `/docs/benchmarks`.

**Acceptance checks.** The restated `claim-table-lock` is proven red by pasting the single-run
0.699× back into the row. The B7 lock (`scripts/benchmark-links-lock.test.ts`) is proven red by
removing one link. Both run in the root suite.

**What to measure.** The window's medians and ranges at build time, written into the row by the
generator. The design gate's reading (50 readings, 2026-10-10 to 2026-10-18: tokens median 0.504,
range 0.434–0.627; turns median 0.524, range 0.446–0.634) is the expected order of magnitude,
not a number to type in.

## Restated 2026-10-18

**B1–B7 and R1–R8 checked against FETCH_HEAD: twelve held or restated, three open — REMAINING: B7 public-number link lock, R6 ≥30-spawn floor untested, B1 N≥5 runs untested.** *2026-10-19: both floors locked by `benchmarks/sample-floor.test.ts` (red with `ROUNDS = 20` and `RUNS_PER_TASK = 3`); B7 remains.*

The § Built 2026-09-09 table below already records the five design deviations; this
section adds the check for each requirement as it stands on FETCH_HEAD.

| ID | promised | on main | check | disposition |
| :-- | :-- | :-- | :-- | :-- |
| B1 | agent cost: tokens, turns, success per task, layer on vs off, median of N≥5 | burgee demo vs commander demo, 5 runs per task (`RUNS_PER_TASK`), claims settled on totals (D-20261009-b1-totals-and-explain) with medians beside them | `benchmarks/agent.test.ts` › "emits medians that are the stub's reported usage, not a table someone wrote down"; `benchmarks/agent.test.ts` › "sums each variant's turns and tokens over its task-runs, and divides the sums" | restated; the N≥5 floor held since 2026-10-19 by `benchmarks/sample-floor.test.ts` › "the agent axis runs every task at least 5 times per build (B1)" |
| B2 | cold start p50/p95 over ≥30 spawns, bare node, hosts, front-ends | 52 interleaved rounds, paired ratio banded | `benchmarks/fixtures.test.ts` › "includes the bare-node floor row, which intent constraint 5 makes mandatory"; `benchmarks/ratchet.test.ts` › "gates the median, not the p95 — an absolute or tail-driven gate is what red-lit two innocent PRs in #27" | held; ≥30 with R6 |
| B3 | per-host pass rate read from `compat-oracle`, never recomputed | `axes/compat.ts` re-emits `grade.rate` and `grade.passed` | `benchmarks/ratchet.test.ts` › "exits non-zero when one case out of 1,360 stops passing", › "exits zero at the baseline" | held |
| B4 | bundled size of a one-import fixture per entry, against its target | bytes, per pair in `fixtures/entry-points.ts` | `benchmarks/ratchet.test.ts` › "exits non-zero one byte over"; `benchmarks/fixtures.test.ts` › "re-export the symbol they import, so the bundler cannot shake away the subject" | held |
| B5 | one record shape; one collector reads every axis | `BenchRecord` in `benchmarks/record.ts` | `benchmarks/bands.test.ts` › "declares a suite and a jsonPath for every band, in the one shape the collector reads"; `benchmarks/emit.test.ts` › "a record with no samples behind it" | held |
| B6 | `npm run bench` runs every axis, `--axis` one; B2–B4 per PR, B1 weekly | yes; two suites on two cadences in `bench.yml` | `benchmarks/ci-axes.test.ts` › "never mixes the two suites in one command — they run on different cadences"; `benchmarks/ratchet.test.ts` › "leaves an axis nobody asked for alone — `--axis weight` must not fail on the other four" | held |
| B7 | every public number links to the generated `/benchmarks` page | the page is generated; links are not checked | none | remaining |
| R1 | `tasks/<id>.json` `{ id, prompt, setup, check, maxTurns }` | plus `requirement`, `modalities`, `exemplar` | `benchmarks/tasks.test.ts` › "$id names the floor requirement it is there to move", › "$id fails on a confident wrong answer, not just on silence" | restated |
| R2 | `axes/agent.ts` spawns `claude -p … --allowedTools 'Bash(mytool:*)'` | the tool is `demo` (D-20261008-b1-tool-name), `stream-json`, strict MCP config | `benchmarks/agent.test.ts` › "is what claude is actually spawned with"; › "matches the name each demo CLI declares" | restated |
| R3 | `results/<date>-<model>-<layer>.json` | `results/<suite>/YYYY-MM-DD.json` published, `YYYY-MM-DD-<sha>-<ci\|local>.json` observed (D-142) | `benchmarks/published.test.ts` › "skips an observation taken after the last published measurement", › "a CI observation and a local one of the same commit on the same day never share a name" | restated |
| R4 | `summary.ts` before/after table, Markdown and JSON | `scripts/bench-page.ts` writes `apps/docs/content/docs/benchmarks.mdx` from the published JSON | `benchmarks/page.test.ts` › "every axis the document reports as not measured is named as such on the page"; `quality.yml` runs `npm run bench:page -- --check` | restated |
| R5 | the `benchmark-json` collector reads every axis's `median` | yes | `benchmarks/bands.test.ts` › "agrees with .sdlc/bands/control-bands.json, band for band", › "goes red for a producer no band reads — the other direction, so an axis cannot emit into the void" | held |
| R6 | `axes/perf.ts` ≥30 spawns per variant, warm-up discarded, bare node floor row | `ROUNDS = 52`, one discarded warm-up round, floor row present | floor row: `benchmarks/fixtures.test.ts` › "includes the bare-node floor row, which intent constraint 5 makes mandatory"; ≥30 since 2026-10-19: `benchmarks/sample-floor.test.ts` › "perf spawns every variant at least 30 times per run (R6)", › "the newest CI reading carries those samples on every perf record"; warm-up: the discarded round in `run()`, stated in `method`, no test | held (the count, 2026-10-19); the warm-up by code reading only |
| R7 | `axes/weight.ts` esbuild, minified, one-import fixture | yes | `benchmarks/fixtures.test.ts` › "pair each entry point with exactly one incumbent, and name every pair and claim once"; `benchmarks/ratchet.test.ts` › "exits zero exactly at the ceiling" | held |
| R8 | `axes/compat.ts` re-emits the oracle's JSON, no logic of its own | yes; rate is `grade.rate`, the gate is the oracle's baseline | `benchmarks/ratchet.test.ts` › "catches a lost case even when the rounded rate still looks like 100%"; › "grades the hosts it has, when an ungraded one is declared planned" | held |

- **R6 / B1 (remaining).** `benchmarks/perf.test.ts` › "is a whole number of rounds per
  variant, so no variant goes first more often than another" pins only
  `ROUNDS % VARIANTS.length === 0`; nothing fails if `ROUNDS` drops below 30, if the warm-up
  round is removed, or if `RUNS_PER_TASK` drops below 5. The tracker's "B3/R8 compat-axis test
  missing" did not hold on FETCH_HEAD: `hostRecords` and `gradeRecords` from
  `benchmarks/axes/compat.ts` are exercised by five cases in `benchmarks/ratchet.test.ts`.
- **B7 (remaining).** `benchmarks/docs.test.ts` › "comparison.mdx states the numbers the suite
  measured" holds that `comparison.mdx` and the suite agree; no check holds that a number in
  the README, `comparison.mdx` or a package README links to `/docs/benchmarks`.
- **Verification section.** All four items exist: `benchmarks/ratchet.test.ts` (proven red per
  axis); the stubbed-`claude` run (`benchmarks/agent.test.ts` › "emits medians that are the
  stub's reported usage, not a table someone wrote down"); the un-run lock
  (`benchmarks/tasks.test.ts` › "$id fails on the un-run state"); and `bench.yml` landing
  observations by PR.

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
`tests: 803, passed: 804` *(2026-09-09 reading; 816 / 816 against yargs 18.2.0 on
`benchmarks/results/cli-benchmarks/2026-10-12-d8569f5-ci.json`, with the skipped case now
inside both counts)*, because the host's own TAP summary counts a case it skipped on
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
committed by a person. `YYYY-MM-DD-<sha>-<ci|local>.json` is an observation from a run at
that commit (the suffix since 2026-09-22, D-142). The bands read both, CI runs only; `bench-page.ts` and `docs.test.ts` go
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
