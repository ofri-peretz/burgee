# Design — `agent-cli-bench`

Intent: [`intent.md`](./intent.md). **Status:** draft.

---

## Requirements

- **R1** `benchmarks/agent-cli-bench/tasks/<id>.json`: `{ id, prompt, setup: string[]
  (shell), check: string (shell, exit 0 = success), maxTurns }`.
- **R2** `run.ts --layer on|off --model <id> --runs N`: builds the demo into a temp
  `PATH` dir as `mytool`, then for each task and run spawns `claude -p <prompt>
  --allowedTools 'Bash(mytool:*)' --max-turns <n> --output-format json`, parses usage
  and tool-call counts, runs `check`, writes one results file.
- **R3** Results schema `benchmarks/agent-cli-bench/results.schema.json`; `results/
  <date>-<model>-<layer>.json` committed by the workflow via PR (same pattern as
  eslint's benchmark results).
- **R4** `summary.ts` produces the before/after table (median per task, delta %) as
  Markdown and JSON; the docs site reads the JSON.
- **R5** Band wiring: `benchmark-json` collector with `jsonPath: "median.tokens"` and
  `"median.turns"` over the `layer: on` file.

## Design

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

## Verification

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
- **Running on every PR.** Cost and noise; weekly plus `packages/**` changes is the
  cadence, with `run-full-ci` for on-demand.

## Out of scope

- Multi-model leaderboards; one band per model, and only one model in the band.
- Benchmarking CLIs outside the demo (interlace-ui, others) — later, once the harness
  is trusted.
