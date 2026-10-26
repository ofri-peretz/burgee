# Intent — `oxmutate`: a Rust/oxc mutation tester that CI can afford, Stryker-compatible

> Stage 1 artifact of the AI-native SDLC. **v2, 2026-10-25** (v1 was the same day). Triggered by:
> (a) burgee's own weekly Stryker run, which took **186 minutes** for one package
> (`.sdlc/bands/mutation-ratchets.json`, observation 2026-10-24) and whose PR lane has a
> 15-minute budget; (b) a Stryker 10.0.0 defect burgee already hit — the vitest runner's name
> filter silently turns killed mutants into survivors on vitest 5
> (`.sdlc/intents/mutation-tested/intent.md`); (c) Anthropic's formal-verification research
> (anthropic.com/research/formal-verification), which argues that LLM-written proofs need specs
> that the code cannot game.
>
> The colleague's "19x on dayjs" figure is unverified and second-hand. Stage 0 measures it on our
> own fixture before anyone repeats it.

**Status:** draft · **Opened:** `2026-10-25` · **Owner:** `@ofri-peretz`

---

## Who this is for

**Primary persona — the maintainer who owns a mutation gate.** A TypeScript monorepo of 10–50
packages, already running Stryker, with a score floor in CI. Their weekly full run no longer
fits the CI budget, a PR gate fails on mutants the tests actually kill, and they are starting to
use coding agents to write tests. They are a tech lead or a maintainer, not a Stryker expert, and
they pay in CI minutes and in engineer time spent triaging false survivors.

What they need, in the order they will notice it:

1. **Same answer, faster.** Killed/survived verdicts that match Stryker, in minutes not hours.
2. **No migration project.** Their `stryker.config.*`, `// Stryker disable` comments, and
   `mutation-ratchets.json` keep working unchanged.
3. **No false survivors.** A mutant that a test kills must never be reported as survived. When the
   instrument is wrong, the tool says so and refuses to score, rather than failing an honest PR.
4. **Survivors that an agent or a human can act on** — file, line, operator, and the test that
   would have killed it — in a format that GitHub code scanning and a coding agent both read.

**Customer zero is burgee itself.** Its weekly run is the baseline we beat, its PR lane is the
first CI integration, and its `mutation-ratchets.json` is the first file the tool must update
correctly. An external persona is a hypothesis until a second repo runs the tool and reports its
own numbers. Anti-persona: a repo with no tests to mutate, or a non-JS/TS codebase.

**Value, in the terms the eslint `cicd-impact` model uses:** weekly CI minutes saved ×
runner cost, plus engineer minutes not spent triaging false survivors. Stage 0 supplies the
first number; Stage 6 supplies the second, from burgee's own triage log.

## Name and ecosystem fit

**Name: `oxmutate`** (decided 2026-10-26). It follows the oxc tool pattern, `ox` + verb
(`oxlint`, `oxfmt`), so a developer who knows those reads it as the oxc mutation tool. Checked
on npm on 2026-10-26: `oxmutate`, `oxmutant`, `oxmutation` free; `oxmut` taken (an unrelated 2016
placeholder); `oxc-*` names all belong to the oxc project, so they were rejected as reading
official. `oxc-striker`-style names were rejected as borrowing Stryker's brand.

- **Affiliation.** Every `ox*` tool today is official oxc. Until the oxc team says otherwise, the
  README states "community project, built on oxc, not affiliated with the oxc project". Contact the
  oxc maintainers once the spike has measured numbers; rename before 1.0 if they object.
- **Vite+ fit.** Vite+ fronts its tools with generic `vp` verbs (`vp check` → Oxlint, Oxfmt,
  tsgo; `vp test` → Vitest; `vp build` → Rolldown, Oxc; `vp pack` → library bundling). Its alpha
  announcement documents no third-party subcommands, so `oxmutate` runs as `vpx oxmutate`
  (or `npx oxmutate`) beside `vp test`, driving the same Vitest. A `vp mutate` slot is a
  conversation with VoidZero, not an assumption.

## What is wanted

1. **Mutants from oxc, one instrumented build, a Rust worker pool.** Generation, type-checking
   and test scheduling run in Rust; Node runs only the test runner it is asked to run.
2. **Coverage-narrowed runs.** Each mutant runs only the tests that reach its line, from a
   dry-run coverage map.
3. **A CI-shaped surface.** One command per lane — `changed` (the PR and merge-queue lane),
   `full --shard i/n` (the weekly run, sharded across a CI matrix), and `record` (write the ratchet
   observation). Each lane has a time budget and a summary a human reads in the CI log.
4. **A report that is three things at once:** Stryker's JSON (so `mutation-testing-elements` and
   the existing ratchet read it), SARIF 2.1.0 (so survivors annotate the PR diff in code
   scanning), and an agent envelope (`--json` with a `fix:` line per survivor).
5. **A frozen-oracle check against reward hacking.** When a change edits tests, the tool also scores
   the same mutants against the base branch's tests. A score that drops under the frozen oracle
   means the change weakened the tests, and the lane says so. This is the Anthropic-paper concern
   (patch-and-reprove invites gaming) written as a CI check.

## Why now

- **Measured: 186 minutes for one package** (burgee, 13,738 mutants, 2026-10-24); 80 minutes for
  caique; PR lane budget 15 minutes. Stryker cannot run the PR lane on the changed lines of a large
  PR in budget without splitting it (`scripts/mutation.ts` already refuses an over-budget run).
- **Measured defect in the instrument:** the vitest-runner name filter under vitest 5 marks killed
  mutants as survived. Burgee works around it in `scripts/mutation-vitest-setup.ts`. A native
  runner that maps mutants by test file and ID removes the workaround class of bug, and a fixture
  reproduces the original failure on the unfixed state.
- **Formal verification needs a cheap strength signal first.** Anthropic's post reports hundreds of
  bugs found by proofs that LLMs wrote. A proof is only as good as its spec, and a survivor is the
  cheapest evidence that a spec or test would miss a fault. The post also says a verified entry
  point does not mean a bug-free library. Mutation tests measure what proofs do not cover.

## Research this connects to, and how

| Source | Claim we rely on | What the tool does with it |
| :-- | :-- | :-- |
| Anthropic, formal verification (2026) | Proofs can be written by Claude at scale; the spec is the trust boundary; patch-and-reprove invites reward hacking | Frozen-oracle lane (above); survivors are the input to spec writing; the report records which operators a spec would have caught |
| Anthropic, code execution with MCP | Tool results flow through the context; structured, small results cost less | `--json` envelope and `survivors --json` are the agent surface; no transcript dumps |
| Quint (`.sdlc/JEV-AND-QUINT.md`) | A design state machine is checked by a model checker, with a counterexample trace | Optional Stage 9 (plan): a mutant that a `.qnt` safety invariant rejects is `killed-by-spec`, a formal kill reason next to the test kill |
| Our agent-requirements research (`.sdlc/research/agent-requirements.md`) | Correctness and parse reliability matter more than token savings for CLIs | Verdicts are exact and machine-stable; the surface is graded on parse reliability, not on token counts |

The native connection is the MCP and `--json` surface of burgee, so Claude Code can call the tool,
read survivors, and write the killing test in the same session. That is the loop the Anthropic post
describes, with a measured mutation score instead of a proof as the stop condition.

## Native to our stack

Use what we ship. Each row names the package and the job it does here.

| Package | Repo | Job in `oxmutate` |
| :-- | :-- | :-- |
| `burgee` | burgee | The CLI surface: one declaration gives help, `--json`, `--schema`, completions, an MCP server, and exit codes with `fix:` lines. The Rust core is the engine; burgee is the front. |
| `compat-oracle` | burgee | Grades the Stryker-compat claim with Stryker's own test suite (`PRINCIPLES.md`: drop-in compatibility graded by the incumbent's own tests). Nothing ships compat claims without this grade. |
| `seniority` | burgee | Config precedence with provenance: flags > env > `stryker.config.*` > defaults. "Why did this run use concurrency 2?" has a one-line answer. |
| `bellpull` | burgee | Runs the test runner and resolves `vitest` as an executable, returning a structured result (no `execa`). |
| `closeout` | burgee | Kills every worker on Ctrl-C, timeout or crash; restores the terminal; holds shutdown to a deadline. A mutation run that leaves 40 vitest processes behind is a real failure mode. |
| `flagstaff` | burgee | Live progress for a person; a static projection for CI logs, pipes and agents. |
| `roundel` | burgee | Colour policy and the theme for the terminal summary, contrast-checked. |
| `linegauge` | burgee | Measures and truncates survivor source lines so the summary stays one screen wide. |
| `paratext` | burgee | Hyperlinks from a survivor to `file:line` in terminals that support them, with a plain fallback. |
| `caique` | burgee | `oxmutate init` prompts flag-first; a non-TTY caller gets an error naming the flag, never a hang. |
| `eslint-formatter-sarif` | eslint | Conformance target for the SARIF output (SARIF 2.1.0 contract and its tests); survivors become code-scanning alerts on the PR. |
| `eslint-formatter` | eslint | Grouping model for the human summary: survivors grouped by operator, the way ESLint output groups by rule. |
| `eslint-devkit` | eslint | Reuse its SARIF helpers if they are plain functions; otherwise the spec copies the schema and tests. Verified in Stage 3, not assumed. |
| `eslint-harness` | eslint | Already pins `@stryker-mutator/*` 10.0.0 as a devDependency; its fixtures are candidates for the parity corpus. |
| `cicd-impact` (folder) | eslint | The value model for the ICP section: CI minutes and runner cost, the same method as its `methodology.md`. |

Adopting `burgee` and `compat-oracle` means the tool's first CI check is the one this repo already
trusts. The rule stays: no package gains a runtime dependency beyond its platform binary.

## Constraints

- **Stryker-compatible in four places:** the JSON report schema, `stryker.config.*` (read, not
  rewritten), `// Stryker disable next-line <Mutator>: <reason>` (the reason is required, as today),
  and the `mutation-ratchets.json` observation format.
- **Verdicts match Stryker or the difference is listed.** Speed is a win only with agreement.
- **No employer material.** The colleague's Rust code is Snappy work. It is not read, copied or used
  as a reference. Design comes from Stryker's public source and docs, oxc's docs, and our own
  measurements.
- **Zero runtime npm dependencies** beyond the platform binary (`SC6`).
- **Node 24** for the JS glue (burgee `CLAUDE.md`), with the published-package floor
  (`^20.19.0 || >=22.13.0`) held by `compat.yml`'s floor job, as the other burgee packages hold it
  (D-132).

## Success criteria

Each line is a command or a file a reviewer can check.

- `SC1` — `npm run bench:mutation` on the reference fixture reports wall-clock for Stryker 10.0.0
  and for this tool, with command lines and machine spec. Five runs each; medians published.
- `SC2` — speedup ≥ 10x on the fixture (warm, median of five). Cold cache reported beside it.
- `SC3` — killed/survived/timeout verdicts agree with Stryker on ≥ 99% of mutants; every
  disagreement is listed in `bench/disagreements.json` with a reason.
- `SC4` — the report validates against Stryker's JSON schema, and the SARIF validates against the
  SARIF 2.1.0 schema.
- `SC5` — **sensitivity:** a weak suite produces survivors and the closed suite produces none.
  Proven to fail on the unfixed state before the tool exists (Stage 2).
- `SC6` — `npm ls --omit=dev` lists no runtime dependency beyond the platform binary.
- `SC7` — **the vitest-5 regression:** on the fixture that reproduces burgee's false survivors,
  zero killed mutants are reported as survived. This is the check that would have caught the
  original defect.
- `SC8` — **CI budget:** a full run of burgee (13,738 mutants, the 2026-10-24 baseline) completes
  in ≤ 30 minutes on the CI runner, sharded across ≤ 8 matrix jobs. The PR lane completes in
  ≤ 10 minutes on a 500-line change. Both measured on the runner, not on a laptop.
- `SC9` — **compat-oracle grade:** the Stryker-compat claim is graded against Stryker's own tests at
  100% of the cases the oracle runs, or the gap is listed.
- `SC10` — **frozen oracle:** on a fixture where a change weakens a test, the lane reports the drop;
  on a fixture where the change only adds a test, the lane reports no drop.
- `SC11` — **dogfood:** burgee's `mutation.yml` runs the tool for one full week and records the
  observation in `mutation-ratchets.json` with the same schema. The Stryker job is removed only
  after that week is green.

## Open questions

Every question this intent raised is closed in `.sdlc/decisions/` (the repository's policy,
`.sdlc/DECISIONS.md`); each bullet keeps the question and points at its answer.

- **Repo fit.** Decided 2026-10-26 by the owner: burgee, by design — [D-20261026-oxmutate-repo-fit](../../decisions/D-20261026-oxmutate-repo-fit.md). Burgee is
  the one monorepo for JS/TS tooling, the same shape as Vite+. The owner's thesis: with AI
  velocity, a few players will control the JS/TS open-source toolchain, and whoever controls it
  can turn engineering teams into product users; Cloudflare and the Vite team are acting on that.
  Owning the quality layer (lint rules, CLI framework, mutation testing) is our seat. The layers
  are complementary: VoidZero started at the metal (parser, bundler, runner), we started at lint
  plugins and the CLI framework, and `oxmutate` sits on their engine and our quality layer at
  once. They have far more people, money and speed, so we win on focus and pace.
- **Name and engine ("vite plus (rust/oxc)").** Decided 2026-10-26 by the owner: `oxmutate`, on
  oxc — [D-20261026-oxmutate-name-and-engine](../../decisions/D-20261026-oxmutate-name-and-engine.md).
- **Equivalent mutants.** Decided 2026-10-26: `equivalentCandidate` with a recorded reason,
  excluded from the score — [D-20261026-oxmutate-equivalent-mutants](../../decisions/D-20261026-oxmutate-equivalent-mutants.md).
- **Type-checking mutants.** Decided 2026-10-26: kept, parallel, with `tsgo`, drop count
  reported — [D-20261026-oxmutate-type-check-mutants](../../decisions/D-20261026-oxmutate-type-check-mutants.md).
- **Quint oracle.** Decided 2026-10-26: deferred to roadmap M3.5, which picks one of the four
  `.qnt` models in `.sdlc/models/` against metric `F6` — [D-20261026-oxmutate-quint-oracle-deferred](../../decisions/D-20261026-oxmutate-quint-oracle-deferred.md).
- **Who else pays.** Decided 2026-10-26: deferred until burgee's dogfood week (M3) has published
  numbers; no claim outside before a second repository reports its own — [D-20261026-oxmutate-external-persona-deferred](../../decisions/D-20261026-oxmutate-external-persona-deferred.md).
