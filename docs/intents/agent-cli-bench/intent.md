# Intent — The number: tokens and turns an agent spends per CLI task

> Stage 1 artifact. Child of [`agent-native-cli-layer`](../agent-native-cli-layer/intent.md),
> step 5 of its order of work and its second success criterion. Stage 6's first real band.

**Status:** draft · **Opened:** 2026-09-06 · **Owner:** @ofri-peretz

---

## What is wanted

A benchmark that answers, with a number, the umbrella's thesis: **does the layer make an
AI agent cheaper and more reliable at driving a CLI?** Fixed tasks, the same CLI built
twice (plain commander, layered), an agent run non-interactively, and three metrics per
task: tokens, turns, success. The result feeds a control band so a regression in the
layer is caught by the loop, not by a reader.

## Why now

- **The umbrella promises "≥40% fewer tokens and ≥30% fewer turns" and nothing can
  measure it yet.** A success criterion nobody can run is a wish.
- **The agent-facing design choices are still open on evidence, not opinion.** Whether
  to honour `CLAUDECODE`/`CI` for agent detection, whether `data: null` matters,
  whether `fix` is used — intent 2 defers all three to this benchmark.
- **It is the launch material.** A table of before/after on five tasks is the article;
  the research file is the appendix.

## Affected users and systems

- New `benchmarks/agent-cli-bench/` with `tasks/*.json`, `run.ts`, `results/*.json`.
- `examples/demo-cli-commander` built in two variants by one flag (`LAYER=off`).
- `.agent/control-bands.json` gains `agent-tokens-per-task` and `agent-turns-per-task`
  (intent 3's `benchmark-json` collector).
- `.github/workflows/agent-bench.yml`: weekly and on `packages/**` changes; needs
  `CLAUDE_CODE_OAUTH_TOKEN` (subscription) or `ANTHROPIC_API_KEY`; reports `skipped`
  without one, as `eslint/evals` does.

## Constraints

1. **Deterministic harness, non-deterministic subject.** The task set, the CLI build,
   the prompt and the allowed tools are pinned; the model's path is not. Report the
   median of N≥5 runs per task and keep every raw transcript.
2. The agent sees only Bash on the demo CLI: `claude -p … --allowedTools 'Bash(mytool:*)'`.
   No file reads, so the CLI's own output is the only information channel.
3. Model pinned by id per results file; a model change starts a new band history.
4. Cost ceiling per full run recorded and capped in the workflow (`--max-turns`,
   `--max-budget-usd` when available).

## Success criteria

- Five tasks, each with a machine-checkable outcome: (1) discover and run an unfamiliar
  subcommand, (2) change a config value and confirm it, (3) diagnose why a value is
  wrong (provenance), (4) recover from a runtime failure, (5) complete a task that
  needs a required option in a non-TTY.
- Results JSON has `{ model, layer, task, runs: [{ tokensIn, tokensOut, turns, success,
  transcript }], median }`; the docs site renders the table.
- The band computes after eight weekly runs; the first PR that regresses tokens by 2σ
  gets an auto-written intent.
- The umbrella's ≥40% / ≥30% claim is either confirmed or rewritten with the measured
  number. Both are acceptable outcomes; a claim without a number is not.

## Open questions

- Which model for the band: the cheapest capable one (stable cost) or the one agents
  actually use (representative)? Leaning representative for the article, cheapest
  for the weekly band.
- Should tasks also run against a **yargs** demo once intent 6 lands, giving four
  cells instead of two?
- How to count "turns" when the harness reports tool calls, not conversational turns —
  define as tool calls; document.
