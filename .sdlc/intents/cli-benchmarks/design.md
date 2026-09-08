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
