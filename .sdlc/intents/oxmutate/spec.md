# Design — `oxmutate`

Intent: [`intent.md`](./intent.md). **Status:** draft. Plan: [`plan.md`](./plan.md).

---

## Mutation testing, in one page

A mutation tester answers "would my tests notice if this code were wrong?". It:

1. Takes the source and applies one small, legal change per copy (a **mutant**): `a + b` becomes
   `a - b`, `x > 0` becomes `x >= 0`, `return v` becomes `return undefined`, `if (c)` becomes
   `if (true)`.
2. Runs the test suite against each mutant.
3. Calls a mutant **killed** if some test fails (the mutant is detected), **survived** if all
   tests pass (a gap in the tests), **timeout** if the run hangs, and **no coverage** if no test
   reaches the changed line.
4. Reports the **mutation score**: killed / (total − equivalent − no-coverage) (Stryker's
   definition; we match it so numbers compare).

The cost is the product: N mutants × the test suite. Everything in this design attacks that
product: fewer mutants that need running, cheaper per-mutant runs, and more of them in parallel.

## How Stryker works today

Read from the installed `@stryker-mutator/core` 10.0.0 layout (`eslint-harness/node_modules`)
and its public docs. Verify each point in Stage 3 before relying on it.

| Stage | Stryker component | What it does | Where the time goes |
| :-- | :-- | :-- | :-- |
| Config & init | `config/`, `initializer/` | Loads `stryker.config.*`, resolves plugins by name. | Node startup, plugin resolution. |
| Mutant generation | `@stryker-mutator/instrumenter` | Parses each file (Babel for JS; TypeScript compiler path for TS), walks the AST, inserts a mutant switch. | JS parse and AST walk on every file, single-threaded in Node. |
| Type check | `checker/` | Runs the TypeScript checker on mutated code and drops mutants that fail to compile. | Full `tsc` program per batch. |
| Dry run | `concurrent/`, `child-proxy/` | Runs the test runner once, unmutated, to record coverage and timing. | Test suite once, serially. |
| Mutation run | `concurrent/`, `child-proxy/`, `sandbox/` | Copies the project into sandboxes; each worker is a Node child process running the test runner (Vitest, Jest, Mocha) with an env var selecting the active mutant. Tests per mutant are narrowed by the coverage map (`perTest`). | Test runner startup per worker, then the suite per mutant. |
| Report | `reporters/` | Writes the JSON and HTML reports. | Small. |

Two structural facts follow from this table, and they set the design:

- **One instrumented build, many runs.** Stryker does not rebuild per mutant; the switch is a
  runtime check. Good. But every run still starts a full test runner process and loads the whole
  test suite in a worker.
- **Generation and type-checking are JS, single-threaded.** The parse and the TypeScript program
  are per-file work that a Rust pool would parallelize trivially.

## Requirements

- `R1` — **Mutants from oxc.** Parse every in-scope file with `oxc_parser`, walk the AST with
  `oxc_ast_visit`, and emit mutants as source-range edits (span + replacement), not as rewritten
  files.
- `R2` — **Operator set matches Stryker's defaults** for the first release (arithmetic, logical,
  equality, conditional, boolean literal, string literal, array declaration, block statement,
  update operator, unary operator). A mutant the Stryker default set would produce and this tool
  does not is a `SC3` disagreement.
- `R3` — **One instrumented build.** All mutants are applied as a switch in one emitted artifact
  (`globalThis.__mutant__`), so the project is transformed once.
- `R4` — **Rayon-style worker pool in Rust.** Mutant runs execute on a work-stealing pool sized to
  the CPU count. Each run is a test-runner invocation with the active mutant set; the pool does
  not spawn Node for generation or for the type-check pass.
- `R5` — **Coverage-narrowed runs.** A dry run records which tests cover which source ranges.
  Each mutant runs only the tests that cover its range (`perTest`, as Stryker does). A mutant
  with no covering test is `no-coverage` and is not run.
- `R6` — **Type-check pass in parallel.** The mutated artifact is type-checked per file in the
  pool. Type-invalid mutants are dropped and counted as `compile-error` in the report (Stryker
  drops them silently; we count them so the drop rate is visible).
- `R7` — **Timeouts and infinite loops.** Each run has a timeout derived from the dry-run time
  (default 5x, configurable). A timeout is a kill, as in Stryker.
- `R8` — **Incremental mode.** Keyed on file content hash and dry-run coverage. A rerun re-mutates
  and re-runs only changed files. Cache lives in `node_modules/.cache/oxmutate`.
- `R9` — **Stryker-compatible report.** The JSON validates against the Stryker
  `mutation-testing-report-schema` (`SC4`), so `mutation-testing-elements` renders it.
- `R10` — **Equivalent-candidate heuristic.** A survivor whose mutant produces the same bytes after
  the test run's normalized output is flagged `equivalent-candidate` and excluded from the score,
  with the reason recorded.
- `R11` — **Lanes, not one command.** `changed --base <ref>` (PR and merge-queue: only lines the
  change touched, budgeted), `full --package <p> [--shard i/n]` (weekly, sharded for a CI matrix),
  and `record` (writes the observation into `mutation-ratchets.json` in the existing schema). Each
  lane exits with a documented code: `0` pass, `1` below floor, `2` instrument fault (refused,
  never scored), `3` over budget, with a `fix:` line on every non-zero exit.
- `R12` — **Sharding is deterministic.** `--shard i/n` partitions mutants by stable mutant ID
  (hash of file, span, operator), so a shard's share does not change when unrelated code moves, and
  the union of all shards equals the full run (checked, not assumed).
- `R13` — **SARIF 2.1.0 output.** Each survivor is a `result` with a `physicalLocation` on the
  changed line, a `ruleId` per operator, and a `partialFingerprints` key from the stable mutant ID,
  so code scanning deduplicates across runs. Conformance is graded against the SARIF schema and
  `eslint-formatter-sarif`'s test cases (Stage 3 confirms what is reusable).
- `R14` — **Frozen oracle.** When a change touches a test file, the lane also scores the same
  mutants with the base ref's test files. The report carries both scores and the delta. A
  negative delta is a finding: the change weakened the tests.
- `R15` — **Stryker compatibility surfaces.** Reads `stryker.config.*` (including `mutate`,
  `ignorePatterns`, `concurrency`, `timeoutFactor`, and `vitest` runner settings); honors
  `// Stryker disable next-line <Mutator>: <reason>` and refuses one without a reason; writes the
  JSON report to the path Stryker would use. Anything unread is listed in the report, not silently
  dropped.
- `R16` — **Teardown is part of correctness.** Workers run under `closeout`: on any exit path,
  every vitest child is killed, the terminal is restored, and shutdown has a deadline. A test
  asserts zero orphan processes after a forced abort mid-run.
- `R17` — **Agent surface.** Every lane has `--json` with a stable envelope, and `survivors --json`
  lists survivors with file, line, operator, the source excerpt, and a `fix:` line naming the
  behaviour a test must check. Exposed as an MCP tool through `burgee`'s MCP projection, so a
  coding agent calls it directly.

## Design

Package: `packages/oxmutate/` in burgee, if the repo-fit question resolves to burgee (see
intent Open questions). Otherwise the same layout moves to its own repo without change.

The layout is organised by **ownership**, so each work package in [`plan.md`](./plan.md) writes
one directory and no two agents share a file.

```
packages/oxmutate/
  Cargo.toml                     # workspace; oxc pinned in W0 (WP-I, WP-J import oxc only)
  contracts/                     # FROZEN in W0: mutant.ts, verdict.ts, report.schema.json,
                                 #   sarif.subset.json, ratchet.schema.json, envelope.schema.json,
                                 #   exit.ts, stable-id.ts + stable-id.vectors.json
  crates/
    core/src/
      span_edit.rs  instrument.rs   # WP-I  R1, R3   Mutant -> span edit; one instrumented build
      dry_run.rs    coverage.rs     # WP-K  R5       per-test coverage map
      pool.rs                       # WP-L  R4, R7   rayon pool, timeouts
      typecheck.rs                  # WP-R  R6       parallel per-file type check
      frozen_oracle.rs              # WP-S  R14      base-ref tests scored on the same mutants
      equivalent.rs                 # WP-T  R10      equivalent-candidate heuristic
      cache.rs                      # WP-U  R8       content-hash incremental cache
      shard.rs                      # WP-N  R12      stable-ID partitioning
    operators/src/**                # WP-J  R2       one file per operator family
    report/src/{report,sarif}.rs    # WP-M  R9, R13  Stryker JSON; SARIF 2.1.0
    cli/src/lanes/{changed,full,record}.rs   # WP-V  R11
  src/                            # TypeScript side (npm package, zero runtime deps)
    cli/**                        # WP-Q  R17      burgee declaration: help, --json, --schema, MCP
    config/**, disable.ts         # WP-O  R15      stryker.config.*, disable-comment rule
    proc/**                       # WP-P  R16      closeout wiring, orphan-free teardown
    runner/vitest.ts              # WP-K           invoke vitest with the active mutant set
  npm/                            # platform binary via optionalDependencies (SC6)
  test/
    fixtures/dayjs-like/          # WP-A  reference fixture (Verification)
    fixtures/vitest5-regression/  # WP-B  SC7 fixture
    sensitivity/                  # W0    SC5
    report/ sarif/ cli/ teardown/ config/   # Wave 1 red checks
  bench/                          # WP-A, WP-X
  compat/mutation/                # WP-Y   compat-oracle grade
```

**Runtime dependency policy (`SC6`).** The npm package has zero runtime dependencies. Platform
binaries ship as `optionalDependencies` (one per target), which are the native payload, not
library dependencies. The JS side only locates and executes the binary, and uses burgee for the
CLI surface, closeout for teardown, seniority for config provenance and bellpull for the
runner subprocess (Native to our stack in the intent).

**Test-runner support.** Vitest first (the toolchain target). Jest and Mocha are out of scope for
the first release; `runner/` is the seam for them.

**Order of work** is the dependency graph in [`plan.md`](./plan.md) §2: Wave 0 freezes the
contracts; Wave 1 writes the red checks in parallel; Wave 2 turns the core green by crate; Wave 3
adds the engine features; Wave 4 integrates; Wave 5 measures and wires CI. The requirement-to-work
mapping is in §Traceability below.

## Contracts (frozen in W0)

The shared language of the parallel work. A contract change after W0 is an integrator decision
with a dated note here, never an edit made inside a work package.

```ts
// contracts/mutant.ts
export interface Mutant {
  id: string;                // StableId: 16 lowercase hex, sha-256 of file|start|end|operator|replacement
  file: string;              // repo-relative path
  span: { start: number; end: number };   // UTF-16 offsets into the file as read
  operator: OperatorName;    // one of the R2 operators
  replacement: string;
  line: number;              // 1-based, start of span, for SARIF and the summary
  sourceExcerpt: string;     // <= 160 chars, for the agent envelope
}

// contracts/verdict.ts
export type Verdict =
  | 'killed' | 'survived' | 'timeout' | 'noCoverage'
  | 'compileError' | 'equivalentCandidate' | 'killedBySpec';
export interface MutantVerdict { id: string; verdict: Verdict; killedBy?: string[]; reason?: string }
```

```ts
// contracts/exit.ts
export const ExitCode = { Pass: 0, BelowFloor: 1, InstrumentFault: 2, OverBudget: 3, Usage: 4 } as const;
```

- **StableId vectors:** `contracts/stable-id.vectors.json` holds three golden triples
  (file, span, operator, replacement → id). Every WP that computes an ID is checked against them,
  so shards, SARIF fingerprints and the cache agree across machines.
- **Report:** Stryker's `mutation-testing-report-schema` 1.x unchanged, plus an `x-oxmutate`
  block carrying the frozen-oracle delta, the compile-error drop count and the unread config keys.
  Validated by `contracts/report.schema.json`, which allows the extension and nothing else.
- **SARIF:** one `result` per survivor; `ruleId` = operator; `partialFingerprints.mutationId` =
  StableId; `physicalLocation` on the changed line.
- **Ratchet observation:** the existing `mutation-ratchets.json` observation object, unchanged, so
  the `record` lane and the weekly job need no schema migration.
- **Envelope:** `{ ok, lane, data, warnings[], error?: { code, message, fix } }` for `--json`. A
  `fix` is required on every non-zero exit.

## Traceability

Every requirement names the WP that owns it and the command that proves it. An unmapped
requirement or a check with no requirement is a planning defect.

| Req | Owner WP | Proving check | Success criterion |
| :-- | :-- | :-- | :-- |
| R1 span edits from oxc | WP-I | `cargo test -p oxmutate span_edit` | SC3 |
| R2 operator set | WP-J (tests WP-C) | `cargo test -p oxmutate operators` | SC3 |
| R3 one instrumented build | WP-I | `cargo test -p oxmutate span_edit` | SC1 |
| R4 Rust worker pool | WP-L | `cargo test -p oxmutate pool` | SC2 |
| R5 coverage-narrowed runs | WP-K (tests WP-B) | `npm run test:dryrun` | SC2 |
| R6 parallel type check | WP-R | `npm run test:typecheck` | SC3 |
| R7 timeouts count as kills | WP-L | `cargo test -p oxmutate pool` | SC3 |
| R8 incremental cache | WP-U | `npm run test:incremental` | SC8 |
| R9 Stryker JSON | WP-M (tests WP-E) | `npm run test:report` | SC4 |
| R10 equivalent candidates | WP-T | `npm run test:equivalent` | SC3 |
| R11 lanes and exit codes | WP-V | `npm run test:lanes` | SC8, SC11 |
| R12 deterministic sharding | WP-N | `npm run test:sharding` | SC8 |
| R13 SARIF 2.1.0 | WP-M (tests WP-D) | `npm run test:sarif` | SC4 |
| R14 frozen oracle | WP-S | `npm run test:frozen-oracle` | SC10 |
| R15 Stryker compat surfaces | WP-O (tests WP-H) | `npm run test:config` | SC9 |
| R16 orphan-free teardown | WP-P (tests WP-G) | `npm run test:teardown` | SC1, SC11 |
| R17 agent surface | WP-Q (tests WP-F) | `npm run test:cli` | SC4 |
| Vitest-5 regression | WP-B, WP-K | `npm run test:vitest5-regression` | SC7 |
| Sensitivity (fails unfixed) | W0 | `npm run test:sensitivity` | SC5 |

## Verification

The feedback loop, one command per check. Each exits non-zero when wrong.

| Check | Command | Fails when |
| :-- | :-- | :-- |
| Operator unit tests | `cargo test -p oxmutate operators` | a mutant is missing or wrong for its operator |
| Span correctness | `cargo test -p oxmutate span_edit` | applying a span edit does not reproduce the expected source |
| Schema | `npm run test:schema` (`SC4`) | the report fails the Stryker JSON schema |
| Parity | `npm run bench:mutation -- --parity` (`SC3`) | killed/survived agreement with Stryker is below 99% |
| Speed | `npm run bench:mutation` (`SC1`, `SC2`) | speedup on the fixture is below 10x |
| Sensitivity | `npm run test:sensitivity` (`SC5`) | a weak suite yields no survivors, or a killed suite yields survivors |
| Zero deps | `npm ls --omit=dev` (`SC6`) | any runtime dependency appears |

**The check that would have caught the original problem.** The original problem is "a mutation
score that looks fine because the tests are weak". `SC5` is that check: `test:sensitivity` runs
two fixture suites, one with known gaps and one with the gaps closed, and asserts the survivors
appear and disappear. Per the AI-native SDLC rule 4, this check is run against the unfixed state
first (the weak suite, before any operator is implemented, must show zero mutants generated and
fail the sensitivity assertion) to prove it can fail.

**Benchmark honesty.** `bench:mutation` runs Stryker 10.0.0 and this tool on the same fixture,
same machine, same CPU count, five runs each, and records both wall-clock medians and the machine
spec. A number that is not produced by this script is not published.

**Reference fixture.** `test/fixtures/dayjs-like/`: a date library of roughly the size and shape of
dayjs (utility modules, many small pure functions, a Vitest suite). Chosen because it is the
benchmark the colleague's claim used, so a result is comparable. No Snappy code is copied into it.

## Rejected alternatives

- **Fork Stryker and swap its instrumenter for oxc.** Keeps the Node worker model, which is half
  the cost. Speed would be a fraction of what a Rust pool gives. Rejected.
- **Port the colleague's Rust mutation runner.** It is employer work (Snappy). Using it would
  breach the ventures rule on employer material and make the result unpublishable. Idea-level
  discussion only, and the colleague was not contacted (decision 2026-10-25). Rejected.
- **Start with formal verification (Quint or Coq, as in Anthropic's post).** Proofs need specs, and
  a spec of the code under test does not exist yet. Mutation testing measures the strength of
  existing tests and specs at near-zero spec cost. Formal verification is the next layer, not
  the first. Deferred, not rejected.
- **Only mutate changed lines by git diff, never full runs.** Good as a mode (`--since`), not as the
  only mode: a score for the whole repo is the number teams gate on. Kept as an option under R8.
- **Skip the type-check pass for speed.** Without it, compile-error mutants are counted as killed
  (a crash is a kill), which inflates the score. Kept, parallelized (R6).

## Out of scope

- Languages other than JavaScript and TypeScript.
- Jest and Mocha runners (the seam exists; the adapter does not).
- A hosted dashboard. The report is a file; `mutation-testing-elements` renders it.
- Formal verification, Quint models, and Coq/Rocq proofs. Next intent, after this one measures.
- Any use of employer code, data, or repositories (`ventures/AGENTS.md`).
