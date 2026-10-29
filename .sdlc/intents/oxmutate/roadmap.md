# Roadmap — `oxmutate`

Intent: [`intent.md`](./intent.md) · Design: [`spec.md`](./spec.md) · Execution: [`plan.md`](./plan.md)
· **Status:** draft, 2026-10-26.

Built from Stryker's **actual** capability surface, read from the installed `@stryker-mutator/*`
10.0.0 (`core/schema/stryker-schema.json`, `instrumenter/dist/src/mutators/`,
`instrumenter/dist/src/parsers/`, `core/dist/src/reporters/`), not from its docs or memory.
Dates are targets (hypotheses), not commitments; each milestone ships only when its gate passes.

## The engine rule

Everything that touches source code runs in Rust on the oxc engine. Node runs only the test
runner it is asked to run.

| Job | Stryker 10.0.0 | `oxmutate` |
| :-- | :-- | :-- |
| Parse JS / TS / JSX / TSX | Babel (`js-parser`, `ts-parser`) in Node | `oxc_parser`, parallel per file |
| Walk and mutate the AST | Babel traversal, 17 mutator classes | `oxc_ast` visitor, one Rust module per mutator family |
| Regex mutants | `weapon-regex` (JS) | `oxc_regular_expression` (oxc's own regex parser) |
| Emit instrumented code | Babel generator | `oxc_codegen`, with source maps |
| Scope and binding facts (static mutants, equivalents) | Ad hoc | `oxc_semantic` |
| Type-check mutants | `@stryker-mutator/typescript-checker` (the `tsc` program) | `tsgo`, the native TypeScript port that `vp check` already runs |
| Run tests | Child process per worker, project copied to a sandbox | Warm Vitest worker, no sandbox copy (M0 decides) |
| Bundling | Not used | Not on the critical path. Rolldown only if a runner needs a bundled build. |

The fit with Vite+ is direct: `vp check` already runs oxc and tsgo, and `vp test` already runs
Vitest. `oxmutate` adds mutation on the same three pieces, as `vpx oxmutate`.

## Stryker capability matrix

Every Stryker 10.0.0 capability, where it lands, and what "better" means. **P** = parity,
**B** = better than Stryker, **N** = not needed by design, **L** = later, on demand.

### Mutators (17 families)

| Stryker mutator | Milestone | Note |
| :-- | :-- | :-- |
| ArithmeticOperator, EqualityOperator, LogicalOperator, ConditionalExpression, BooleanLiteral, UnaryOperator, UpdateOperator, BlockStatement | M1 · P | The core set; covers most mutants on typical code |
| StringLiteral, ArrayDeclaration, ObjectLiteral, ArrowFunction, AssignmentOperator | M1 · P | |
| OptionalChaining, MethodExpression | M2 · P | Method swaps (`filter`→`find`, `startsWith`→`endsWith`) |
| Regex | M2 · B | Native regex AST from oxc instead of a JS library |
| EmptyExpression | M2 · P | Completes the 17; full set equals Stryker's default |
| `mutator.excludedMutations` | M1 · P | Same config key |

### Languages and files

| Stryker parser | Milestone | Note |
| :-- | :-- | :-- |
| JavaScript, TypeScript, JSX, TSX | M1 · P | oxc parses all four |
| HTML (inline `<script>`) | L | Extract script blocks, mutate with oxc |
| Svelte | L | Needs a component-block extractor; oxc parses the script |
| Vue SFC | L | Not in Stryker's parser list either; on demand |

### Test runners

| Stryker runner | Milestone | Note |
| :-- | :-- | :-- |
| Vitest | M1 · B | Warm runner; fixes the vitest-5 name-filter false survivors burgee measured |
| Command runner (`commandRunner`) | M2 · P | Any test command, process per mutant; the escape hatch |
| Jest | M4 · L | Second runner, if adopters ask |
| Mocha, Jasmine, Karma, Cucumber, Tap | L | Only with a paying or adopting user |

### Execution and correctness

| Stryker option | Milestone | Note |
| :-- | :-- | :-- |
| `mutate`, `ignorePatterns`, `testFiles` | M1 · P | Same globs |
| `coverageAnalysis` (`off`, `all`, `perTest`) | M1 · P | `perTest` default, as Stryker |
| `disableBail` | M1 · B | Bail on first failure by default, with fastest-killer-first ordering from history |
| `concurrency` | M1 · B | Rust pool; one warm runner per worker |
| `timeoutMS`, `timeoutFactor`, `dryRunTimeoutMinutes` | M1 · P | Same semantics; a timeout counts as a kill |
| `ignoreStatic` | M2 · B | Stryker skips static mutants; we score them on a fresh-process path |
| `// Stryker disable` comments | M1 · P | Honored; a reason is required, as burgee's lock already demands |
| `ignorers` (plugins) | M2 · B | Ignore rules as data (PRINCIPLES: plugins are data), not code plugins |
| `checkers`, `disableTypeChecks`, `tsconfigFile` | M2 · B | tsgo, parallel; compile-error drops counted, not hidden |
| `buildCommand` | M2 · P | Run once before the dry run |
| `inPlace`, `tempDirName`, `cleanTempDir`, `symlinkNodeModules` | N | No sandbox copy in the warm design; nothing to configure |
| `maxTestRunnerReuse` | M2 · P | Recycle a warm worker after `n` mutants if memory grows |
| `testRunnerNodeArgs`, `checkerNodeArgs` | M2 · P | Passed through to the Node runner |
| `dryRunOnly`, `allowEmpty`, `force` | M1 · P | |
| `plugins`, `appendPlugins`, `packageManager` | N | No runtime plugin loading; operators and ignorers are data |
| `thresholds` (`high`, `low`, `break`) | M1 · P | `break` fails CI, exit code `1` |
| `warnings` | M1 · P | |

### Incremental

| Stryker option | Milestone | Note |
| :-- | :-- | :-- |
| `incremental`, `incrementalFile` | M2 · B | Keyed on stable mutant ID plus a hash of the covering tests; the gate is to beat Stryker's own `--incremental` on a one-file change |

### Reporters

| Stryker reporter | Milestone | Note |
| :-- | :-- | :-- |
| `json` (mutation-testing-report-schema) | M1 · P | The compatibility anchor; dashboards and ratchets read it |
| `clear-text`, `progress`, `progress-append-only`, `dots` | M1 · P | Through flagstaff and roundel: live for people, static for CI and agents |
| `html` (mutation-testing-elements) | M2 · P | Same web component renders our JSON |
| `dashboard` (Stryker Dashboard upload) | M4 · P | Same report schema, so the upload is a small adapter |
| `event-recorder`, `strict`, `ci` | M2 · P | |
| — SARIF 2.1.0 | M3 · B | Survivors annotate PR lines in code scanning. Stryker has no SARIF reporter in this install. |
| — Agent envelope (`--json`, MCP) | M3 · B | Through burgee's CLI projection |

### Beyond Stryker (no equivalent in 10.0.0)

| Capability | Milestone | Why it matters |
| :-- | :-- | :-- |
| Changed-lines lane (`oxmutate changed --base`) | M3 | The PR gate burgee runs today with a script around Stryker |
| Deterministic sharding (`--shard i/n`) | M3 | A 3-hour run split across a CI matrix |
| Ratchet record (`oxmutate record`) | M3 | Writes `mutation-ratchets.json` observations in the existing schema |
| Frozen oracle | M3 | Flags a PR that weakens tests: the reward-hacking check |
| Teardown guarantee | M1 | Zero orphan workers, through closeout |
| `killed-by-spec` via Quint, then any formal method | M3.5 | A formal kill reason beside the test kill |
| Execution sharing (mutant schemata, split-stream / AccMut-style) | M5 | Research track for the next order-of-magnitude gain |
| Predictive prioritization | M5 | Run the mutants most likely to survive first; useful in PR budgets |

## Status, 2026-10-29

What is built against this matrix. ✅ built and tested · 🟡 partly · ⬜ not started. Every ✅
has a test that fails without it (named in the commit that added it).

| Area | Item | Status | Where |
| :-- | :-- | :-- | :-- |
| Mutators | All 17 families; Stryker's exact set (720/720 on es-toolkit), Regex equal to weapon-regex on 928 of 932 real patterns | ✅ | `native/src/instrument.rs`, `native/src/regex.rs` |
| Mutators | `mutator.excludedMutations`; `// Stryker disable` with a reason | ✅ | `src/config.ts` |
| Mutators | `ignorers`, as data: `ignore: [{ call: 'console.*' }]` | ✅ | native core, `src/config.ts` |
| Runner | Vitest, warm, perTest, bail, adaptive canary, watchdog, no orphans | ✅ | `src/runner.ts`, `src/scheduler.ts`, `src/child.ts` |
| Runner | Command runner (`testRunner: 'command'`) | ✅ | `src/command-runner.ts` |
| Execution | Static mutants scored, loader-scoped; timeouts confirmed at 3x | ✅ | `src/coordinator.ts` |
| Execution | `buildCommand`, `dryRunOnly`, `dryRunTimeoutMinutes`, `allowEmpty`, `testRunnerNodeArgs`, `warnings` | ✅ | `src/config.ts` |
| Execution | Type checker on survivors (`checkers: ['typescript']`, tsgo or tsc) | ✅ | `src/checker.ts` |
| Incremental | `--incremental`, keyed on source plus covering tests | 🟡 | built; not yet measured against Stryker's |
| Reporters | JSON (schema 2), clear-text, SARIF, HTML, progress / progress-append-only / ci | ✅ | `src/reports.ts`, `src/progress.ts` |
| Lanes | `--since`, `--shard`, `survivors --json`, `--mcp`, `--break` (exit 1) | ✅ | `src/lanes.ts`, `src/cli.ts` |
| Lanes | Frozen oracle (`--frozen-oracle <ref>`, R14 / SC10) | ✅ | `src/frozen.ts` |
| Dogfood | burgee's `full` lane on oxmutate (`--engine oxmutate`); `mutation.yml` engine input | ✅ | `scripts/mutation.ts` |
| Config | A `mutate` block in `vite.config.*` (the Vite+ file), typed by `oxmutate/vite` | ✅ | `src/config.ts`, `src/vite.ts` |
| Dogfood | One green week of the weekly run on oxmutate (the M3 gate) | ⬜ | owner: dispatch with `engine: oxmutate` |
| Formal | Spec oracles: Quint (`quint run --mbt`) and ITF backends, `oxmutate/spec`, F1–F4 and F6 | ✅ | `src/spec-oracle.ts`, `src/spec.ts` |
| Formal | The M3.5 gate on a burgee component with a `.qnt` model (closeout's save-restore) | ⬜ | a replay test in closeout's lane |
| Release | Per-platform native packages, trusted publishing, version sync | ✅ | `oxmutate-native.yml`, `release.yml` |
| Release | 1.0.0 on npm, the native cores bundled; docs live at oxmutate.interlace.tools | ✅ | `oxmutate@1.0.0`, release run 40740297440 (publish re-run 2026-10-29), six cores in the tarball |
| Release | Family dependencies by caret range (SC6 restated, D-20261028-oxmutate-sc6-family-deps-bundled-cores) | ✅ | ofri-peretz/burgee#1350; `scripts/package-shape-lock.test.ts` |
| Compat | Graded by Stryker 10.0.0's own mutator specs (SC9): 236 of 236, 4 not applicable | ✅ | `npm run compat:mutation`, `vendor/stryker-mutators`, `compat/not-applicable.ts` |
| Speed | `≥ 5x` on burgee packages (`S3`) | 🟡 | met on es-toolkit; missed on paratext (2.4x) and controlroom (`m1-results.md`) |

M4 items wait for an adopter, and M5 items for a measured gain, as their gates say.

## Milestones

Each milestone has one gate, a command that exits non-zero when it fails. Nothing advances on a
red gate. Speed matters (intent: we win on focus and pace), so every milestone is sized to ship.

### M0 — Spike: can a warm runner beat Stryker by far? (target 2026-11-02) — **PASS, 2026-10-26**

**Result** ([`m0-results.md`](./m0-results.md)): on es-toolkit `src/array` (720 mutants), the oxc
instrumenter plus the warm runner took a median 9.0 s against Stryker's 160.6 s (17.9x), used
25.8x less CPU, produced exactly Stryker's mutant set (720/720), and agreed on 99.72% of verdicts.
The remaining 0.28% are mutants on which Stryker also disagrees with itself between runs. The
spike also built part of M1 early: the oxc instrumenter (`m0/spike/instrument.mjs`) already
implements 16 of the 17 mutator families.

- Warm in-process Vitest runner over one instrumented build, on the dayjs-like fixture.
- **Gate:** `node spike/warm-runner.mjs --fixture dayjs-like --compare bench/baseline-stryker.json`
  shows a median ≤ 20 ms per mutant (Stryker measured ~160 ms on a caique file) and ≥ 99% verdict
  agreement on non-static mutants.
- **If red:** redesign before M1. The command runner path still ships, but the "beat by far" claim
  is dropped until execution sharing (M5) is proven.

### M1 — `oxmutate 0.1`: Vitest + TS/JS, the core 13 mutators (target 2026-11-23)

- Rust core: oxc parse, mutate, codegen; Rust pool; warm Vitest runner; perTest coverage; bail with
  ordering; timeouts; thresholds; disable comments; JSON and terminal reporters; teardown.
- Reads `stryker.config.*` for the options above.
- **Gate:** `npm run bench:mutation -- --parity` ≥ 99% agreement and `npm run bench:mutation` ≥ 5x
  whole-run cold on the fixture; `npx oxmutate run` works in a fresh Vite+ project via `vpx`.

### M2 — Stryker parity (target 2026-12-21)

- All 17 mutator families, regex through `oxc_regular_expression`; static mutants scored;
  ignorers as data; tsgo checker; command runner; incremental; HTML report; build command.
- **Gate:** `npm run compat:mutation` grades the Stryker-compat surface through `compat-oracle` at
  100% of the cases it runs; incremental beats Stryker's `--incremental` on a one-file change.

### M3 — CI and agents; dogfood (target 2027-01-18)

- `changed`, `full --shard`, `record` lanes; SARIF; frozen oracle; burgee CLI surface with
  `--json`, `--schema` and MCP.
- **Gate:** burgee's weekly `mutation.yml` runs `oxmutate` for one green week and records the
  observation; burgee's full run is ≤ 30 minutes on the CI runner (186 minutes on Stryker,
  2026-10-24). The Stryker job is retired after that week.

### M3.5 — Spec oracle: Quint first, any formal method next (target 2027-02-15)

Pulled forward from M5 on 2026-10-26: integrating formal verification is a differentiator Stryker
has no answer to (metrics §6).

- `contracts/spec-oracle.schema.json`: a backend receives the mutant (span, operator, replacement)
  and the mapped spec action or invariant, and returns `killedBySpec` with a counterexample trace, or
  `survivedSpec`. Backends are adapters, so the core never knows which method ran.
- First backend: Quint (`quint run` bounded simulation, then `quint verify`), on one burgee
  component that already has a `.qnt` model (`.sdlc/models/`).
- Second backend candidates, on demand: TLA+ through Apalache, property-based specs through
  fast-check (the cheapest "spec" most JS repos can add), and proof systems where a project has them
  (Lean, Rocq, Dafny).
- Report: `test-spec gap` (spec kills, tests miss) and `spec escape` (both miss) as first-class
  sections, in JSON, SARIF and the agent envelope.
- **Gate:** F1, F2, F4 and F6 measured on one modelled component; F4 ≤ 2x S1.

### M4 — Breadth, on demand (from 2027-02)

- Jest runner, Stryker Dashboard upload, Svelte and HTML script extraction, Vue SFC.
- **Gate per item:** an adopter asked for it, and its parity check passes.

### M5 — Research: the next order of magnitude (from 2027-03)

- Execution sharing across mutants, predictive prioritization, opt-in
  minimal mutant sets (never part of the Stryker-comparable score).
- **Gate per item:** a measured gain on the fixture and on burgee, published with its method.

## Outreach checkpoints (tied to gates, not dates)

- **After M0 green:** contact the oxc maintainers with the numbers. Confirm the `ox*` name is
  acceptable (intent: Name and ecosystem fit).
- **After M1:** announce `vpx oxmutate` to the Vite+ community; offer VoidZero a look at a `vp mutate`
  slot.
- **After M3:** publish burgee's dogfood numbers (186 minutes → measured) as the case study.

## Next actions

- **Owner:** start M0. Build the dayjs-like fixture and the Stryker baseline (`plan.md` WP-A),
  then the warm-runner spike. Target 2026-11-02.
- **Owner:** accept or amend this roadmap with the intent and spec at Gate G0.
