# Intent — `cli-benchmarks`: one suite, four axes, all published

> Stage 1 artifact. Child of [`agent-native-cli-layer`](../agent-native-cli-layer/intent.md).
> Stage 6's real bands. Formerly `agent-cli-bench`: widened on 2026-09-06 from one axis
> (agent cost) to four (agent cost, performance, compatibility, weight), because three of
> the four are claims we already make in public and none of them was measured on a
> schedule.

**Status:** review · **Opened:** 2026-09-06 · **Owner:** @ofri-peretz

---

## What is wanted

One command, `npm run bench`, that produces every number this project claims in public,
in one JSON document, on a schedule, with each number wired to a control band so a
regression is caught by the loop rather than by a reader.

Four axes, because we make four kinds of claim:

| Axis | Question it answers | Headline metric |
| :--- | :--- | :--- |
| **B1 agent cost** | does the layer make an agent cheaper and more reliable? | tokens and turns per task, success rate |
| **B2 performance** | are we cheap to start and to parse? | cold-start p50/p95 ms vs every host |
| **B3 compatibility** | how compatible are we, exactly? | pass rate from `compat-oracle` |
| **B4 weight** | are we lighter than what we replace? | installed KB and bundled KB per entry point |

B1 is the original intent and is unchanged below. B2, B3 and B4 are new: the umbrella
already promises a cold-start budget, `docs/research/competitor-landscape.md` §5 promises
a published compatibility rate, and §6 promises core-under-52KB. Three published promises
with no scheduled measurement between them.

## Why now

- **The umbrella promises "≥40% fewer tokens and ≥30% fewer turns" and nothing can
  measure it yet.** A success criterion nobody can run is a wish.
- **The agent-facing design choices are still open on evidence, not opinion.** Whether
  to honour `CLAUDECODE`/`CI` for agent detection, whether `data: null` matters,
  whether `fix` is used — intent 2 defers all three to this benchmark.
- **It is the launch material.** A table of before/after on five tasks is the article;
  the research file is the appendix.
- **Three claims are already public and unmeasured.** The competitor map publishes
  commander at +16ms and cac at 52KB as targets to beat, and the compat strategy publishes
  a pass rate as the thing that replaces the word "100%". A published target with no
  scheduled measurement decays into a slogan within two releases.
- **The axes share one harness.** All four need: build the demo CLI in N variants, run
  something against each, emit one JSON shape, compare against a band. Building them as
  four separate benchmarks would be the same harness written four times.

## Affected users and systems

- New `benchmarks/` with `tasks/*.json`, `axes/{agent,perf,compat,weight}.ts`, one
  `run.ts`, `results/*.json`.
- `examples/demo-cli-commander` built in two variants by one flag (`LAYER=off`).
- `.agent/control-bands.json` gains `agent-tokens-per-task`, `agent-turns-per-task`,
  `cold-start-p95-ms`, `compat-commander-pass-rate`, `compat-yargs-pass-rate`,
  `core-bundled-kb` (intent 3's `benchmark-json` collector reads all six).
- `apps/docs` gains a `/benchmarks` page rendered from the emitted JSON.
- `.github/workflows/bench.yml`: weekly and on `packages/**` changes; needs
  `CLAUDE_CODE_OAUTH_TOKEN` (subscription) or `ANTHROPIC_API_KEY`; reports `skipped`
  without one, as `eslint/evals` does.

## Constraints

0. **Every axis emits the same JSON shape** — `{ axis, variant, metric, unit, samples,
   median, p95 }` — so one band collector reads all four and the docs page renders them
   with one component. An axis that needs a bespoke shape has to argue for it.
1. **Deterministic harness, non-deterministic subject.** The task set, the CLI build,
   the prompt and the allowed tools are pinned; the model's path is not. Report the
   median of N≥5 runs per task and keep every raw transcript.
2. The agent sees only Bash on the demo CLI: `claude -p … --allowedTools 'Bash(mytool:*)'`.
   No file reads, so the CLI's own output is the only information channel.
3. Model pinned by id per results file; a model change starts a new band history.
4. Cost ceiling per full run recorded and capped in the workflow (`--max-turns`,
   `--max-budget-usd` when available).
5. **B2 reports the host baseline in the same table.** A cold-start number without
   `bare node` and the host beside it is unreadable: Node's own 29ms floor is most of
   any figure we publish, and hiding it would overstate what the layer costs.
6. **B2 runs on a dedicated CI runner class and reports p50 and p95 over ≥30 spawns.**
   Shared runners move medians by more than the effect being measured; a single mean is
   not a measurement.
7. **B4 measures the bundled size of a fixture that imports one entry point**, not the
   package tarball. Tarball size does not tell a user what their bundle grows by, which
   is the only number they care about.
8. **B3 does not re-implement the oracle.** It reads `compat-oracle`'s emitted JSON. Two
   places computing a compatibility rate is two rates.

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
- **B2**: cold start reported for bare node, both hosts, both hosts + layer, and the
  replacement, p50 and p95 over ≥30 spawns. The layer's own overhead over its host is
  stated as a single number and banded.
- **B3**: per-host pass rate read from `compat-oracle`, shown as a ratchet over time.
- **B4**: bundled KB for `core`, `core + commander front-end`, `core + yargs front-end`,
  each against the published target (§6 of the competitor map: core under cac's 52KB,
  core + one front-end under the host it replaces).
- One `npm run bench` produces all four; `npm run bench -- --axis perf` produces one.
- The docs site has a `/benchmarks` page that is generated, never hand-edited, and every
  public number we cite elsewhere links to it.

## Open questions

None open. Decided at finalisation (2026-09-06):

- **One model for the band and the article**: the model most agents run today, pinned by
  id in every results file; a model change starts a new band history. Cheaper models may
  be run ad hoc but never feed the band.
- **A yargs cell is added when `yargs-agent` lands** (four cells: host × layer). The band
  reads the commander `layer: on` cell only, so the number stays comparable.
- **"Turns" means tool calls** as reported by `claude -p --output-format json`;
  documented in the results schema.
- **B1 runs weekly, B2/B3/B4 run per PR.** B1 costs money and is noisy over short
  intervals; the other three are cheap, deterministic enough to gate on, and are the ones
  a PR can regress silently.
- **The name is `cli-benchmarks`, not `agent-cli-bench`.** The suite outgrew the agent
  axis on 2026-09-06; a name that describes one of four axes would mislead the next
  reader into adding a fifth benchmark elsewhere.
