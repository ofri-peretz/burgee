# Plan — `oxmutate` (parallel execution)

Intent: [`intent.md`](./intent.md) · Design and contracts: [`spec.md`](./spec.md) ·
Roadmap: [`roadmap.md`](./roadmap.md) · Metrics: [`metrics.md`](./metrics.md) ·
**Status:** approved for M0. **Gate G0** (human acceptance at Design → Build, AI-native SDLC
rule 3) passed for M0 on 2026-10-26, on the owner's directive: "complete the plan and then
immediately move to execute it". G0 for M1 onward is re-taken on M0's measured results.

**M0 done, 2026-10-26: gate passed** ([`m0-results.md`](./m0-results.md)). G0 for M1 is the
owner's call on those numbers.

## Execution order (supersedes the wave numbering below where they differ)

1. **M0 first** (roadmap): Stryker baseline on a real open-source subject, then the warm-runner
   spike, then `m0-results.md`. M0 uses Stryker's own instrumenter so the spike measures the
   execution model alone; the oxc instrumenter is M1 work.
2. **M1 onward** follows the waves below, re-planned on M0's numbers. The Rust toolchain is not
   installed on this machine (checked 2026-10-26); installing it is an owner decision recorded in
   `m0-results.md`.

This plan is written for sub-agents. Each **work package (WP)** is self-contained: one owner,
exclusive files, named inputs, one check command. Waves run in order; WPs inside a wave run in
parallel. A WP is done when its check exits 0 on its own branch, not when its code is written.

---

## 0. Execution rules (apply to every agent)

1. **One writer per file.** A WP may write only the paths in its *Owns* list. Shared files
   (root `Cargo.toml`, root `package.json`, `.github/workflows/*`, `.sdlc/bands/mutation-ratchets.json`,
   `contracts/*`) are written only by the integrator in the named WP. Everyone else reads them.
2. **Contracts are frozen after W0.** Changing `contracts/*` after W0 needs a new WP owned by the
   integrator and a re-run of every WP's check. Agents never edit a contract to make their own
   code pass.
3. **Red first.** Every WP that implements behaviour starts with its tests, and the first commit
   on its branch is the failing check. The check's failing output is quoted in the WP's PR
   description. A check that was never red has proven nothing.
4. **Never edit a test to make it pass.** If a test looks wrong, record the question in
   `open-questions.md` under the WP and stop that WP at the red state.
5. **Concurrency cap.** Burgee's rule: at most **2** background agents doing install, test or push
   work at once. Wave 1 has more WPs than that, so most WPs in a wave are *write-only* (code and
   tests written, no `npm ci` or `cargo test`) until a slot is free. One warm checkout is shared
   read-only for installs: no agent runs `npm ci` in its own worktree.
6. **Worktrees, not clones.** Each WP works in a `git worktree` off the integration branch
   `feat/oxmutate`, named `mo-<WP id>`. Remove with `rm -rf <path> && git worktree prune`
   (burgee `CLAUDE.md`; `git worktree remove` hangs on this machine).
7. **Commits and pushes** use `run_in_background: true` (3–4 minute pre-push battery). Never
   `--no-verify`.
8. **Questions are recorded and defaulted.** An agent hitting an open question records it in its
   WP's *Open questions* block, takes the default in `intent.md`, and continues. It stops only when
   its check cannot be made to run.

## 1. Contracts (frozen in W0)

Defined in `packages/oxmutate/contracts/` as TypeScript types and JSON Schemas. Everything
below depends on them.

| Contract | File | Consumers |
| :-- | :-- | :-- |
| `Mutant` (id, file, span, operator, replacement, sourceExcerpt) | `contracts/mutant.ts` | WP-C, WP-D, WP-H, WP-I, WP-J, WP-K |
| `MutantVerdict` (killed, survived, timeout, noCoverage, compileError, equivalentCandidate, killedBySpec) | `contracts/verdict.ts` | WP-K, WP-M, WP-P, WP-O |
| `Report` (Stryker `mutation-testing-report-schema` 1.x + our `x-oxmutate` extension) | `contracts/report.schema.json` | WP-E, WP-N |
| `Sarif` (SARIF 2.1.0 subset we emit) | `contracts/sarif.subset.json` | WP-D |
| `RatchetObservation` (the existing `mutation-ratchets.json` observation shape) | `contracts/ratchet.schema.json` | WP-E, WP-R |
| `Envelope` (burgee `--json` envelope, stable keys) | `contracts/envelope.schema.json` | WP-F, WP-Q |
| `ExitCode` (0 pass, 1 below floor, 2 instrument fault, 3 over budget, 4 usage) | `contracts/exit.ts` | WP-F, every lane |
| `StableId` (hash of file + span + operator + replacement, 16 hex) | `contracts/stable-id.ts` | WP-C, WP-N, WP-O |

`StableId` is specified exactly, with three golden vectors in `contracts/stable-id.vectors.json`,
so shards and SARIF fingerprints agree across machines.

---

## 2. Waves and work packages

Dependency edges are explicit. "After" means the named WP's check is green on the integration branch.

### Wave 0 — serial, one agent (integrator)

| WP | Owns | Work | Check | After |
| :-- | :-- | :-- | :-- | :-- |
| **W0** | `packages/oxmutate/` skeleton, `contracts/*`, `scripts/oxmutate-check.ts`, `Cargo.toml` (workspace), `package.json` script names | Scaffold; freeze contracts; write `test:sensitivity` so it **fails** with "no mutants generated" | `npm run test:sensitivity` exits **1** with that reason (the unfixed-state proof, SC5) | G0 |

W0 is the only serial step. Its output is the branch every other WP forks from.

### Wave 1 — eight WPs in parallel (all write-only tests and fixtures, no implementation)

| WP | Owns | Work | Check (red at W1 exit) | Expected |
| :-- | :-- | :-- | :-- | :-- |
| **WP-A** Baseline | `bench/stryker-baseline.ts`, `test/fixtures/dayjs-like/` | Build the fixture (dayjs-sized, Vitest). Script runs `npx stryker run` five times. | `npm run bench:stryker-baseline` | **Runs.** Produces the baseline. The only WP that runs a real tool in W1. Needs a Stryker slot (cap 2). |
| **WP-B** Vitest-5 corpus | `test/fixtures/vitest5-regression/` | The fixture that reproduces burgee's false survivors: nested `describe`, vitest 5 name joining with ` > `. | `npm run test:vitest5-regression` | Red (no runner yet). |
| **WP-C** Operators | `packages/oxmutate/crates/operators/tests/` | Failing unit tests, one per R2 operator, on fixture snippets. | `cargo test -p oxmutate operators` | Red. |
| **WP-D** SARIF | `packages/oxmutate/crates/report/tests/sarif/` | SARIF conformance tests against `contracts/sarif.subset.json` and `eslint-formatter-sarif`'s cases. | `npm run test:sarif` | Red. |
| **WP-E** Report & ratchet | `packages/oxmutate/test/report/` | Tests: Stryker-schema validation; ratchet observation round-trip with `mutation-ratchets.json`. | `npm run test:report` | Red. |
| **WP-F** CLI surface | `packages/oxmutate/test/cli/` | Tests of the burgee declaration: help, `--json` envelope, `--schema`, exit codes, `fix:` lines, MCP projection. | `npm run test:cli` | Red. |
| **WP-G** Teardown | `packages/oxmutate/test/teardown/` | Test: forced abort mid-run leaves zero orphan `vitest` children, terminal restored (R16). | `npm run test:teardown` | Red. |
| **WP-H** Config compat | `packages/oxmutate/test/config/` | Tests reading `stryker.config.*`, the disable-comment rule (reason required), unread-key reporting (R15). | `npm run test:config` | Red. |

Wave 1 exits when **all eight** checks are red for the reason named in their WP (the red output is
recorded in each WP's PR). A check that is green at W1 means its WP tested nothing and is sent
back.

### Wave 2 — implementation, parallel by crate

Each WP turns its Wave 1 checks green. Owned paths do not overlap.

| WP | Owns | Depends on (after) | Turns green | Check |
| :-- | :-- | :-- | :-- | :-- |
| **WP-I** Span edits & instrumented build | `crates/core/src/{span_edit,instrument}.rs` | W0, WP-C tests | R1, R3 | `cargo test -p oxmutate span_edit` |
| **WP-J** Operators impl | `crates/operators/src/**` | W0, WP-C | R2 | `cargo test -p oxmutate operators` |
| **WP-K** Dry run & coverage | `crates/core/src/{dry_run,coverage}.rs`, `runner/vitest.ts` | W0, WP-B | R5 | `npm run test:dryrun` (new, owned by K) |
| **WP-L** Pool & timeouts | `crates/core/src/pool.rs` | W0 | R4, R7 | `cargo test -p oxmutate pool` |
| **WP-M** Report writers | `crates/report/src/{report,sarif}.rs` | W0, WP-D, WP-E | R9, R13 | `npm run test:sarif && npm run test:report` |
| **WP-N** Sharding | `crates/core/src/shard.rs` | W0, WP-I (stable IDs) | R12 | `npm run test:sharding` (new, owned by N) |
| **WP-O** Stryker compat | `packages/oxmutate/src/config/**`, `src/disable.ts` | W0, WP-H | R15 | `npm run test:config` |
| **WP-P** Teardown | `packages/oxmutate/src/proc/**` (closeout wiring) | W0, WP-G | R16 | `npm run test:teardown` |
| **WP-Q** CLI | `packages/oxmutate/src/cli/**` (burgee declaration) | W0, WP-F | R17 | `npm run test:cli` |

WP-I and WP-K both touch the per-mutant run path; WP-K owns the runner file and WP-I owns
`instrument.rs`. They meet at the `Mutant` contract, not in a shared file.

### Wave 3 — the remaining engine, parallel

| WP | Owns | Depends on | Turns green | Check |
| :-- | :-- | :-- | :-- | :-- |
| **WP-R** Type-check pass | `crates/core/src/typecheck.rs` | W2 (I, L) | R6 | `npm run test:typecheck` (new, owned by R) |
| **WP-S** Frozen oracle | `crates/core/src/frozen_oracle.rs` | W2 (K, L) | R14 | `npm run test:frozen-oracle` (new, owned by S) |
| **WP-T** Equivalent heuristic | `crates/core/src/equivalent.rs` | W2 (K) | R10 | `npm run test:equivalent` (new, owned by T) |
| **WP-U** Incremental cache | `crates/core/src/cache.rs` | W2 (I, K) | R8 | `npm run test:incremental` (new, owned by U) |
| **WP-V** Lanes | `crates/cli/src/lanes/{changed,full,record}.rs` | W2 (Q, M, N) | R11 | `npm run test:lanes` (new, owned by V) |

### Wave 4 — integration (serial, integrator only)

| WP | Owns | Work | Check |
| :-- | :-- | :-- | :-- |
| **W4** Integrate | root `Cargo.toml`, root `package.json`, `scripts/oxmutate-check.ts` | Merge Wave 3 into `feat/oxmutate`; run every `test:*` script; fix only wiring, never logic. | `npm run ci:oxmutate` (aggregates every check) exits 0 |

### Wave 5 — measurement and CI (parallel where the runner allows)

| WP | Owns | Work | Check | Constraint |
| :-- | :-- | :-- | :-- | :-- |
| **WP-X** Parity & speed | `bench/mutation.ts`, `bench/results/`, `bench/disagreements.json` | SC1–SC3. Five runs each. | `npm run bench:mutation -- --parity` and `npm run bench:mutation` | Needs both tools on the same machine; runs alone. |
| **WP-Y** Compat grade | `compat/mutation/**` | SC9 via `compat-oracle` | `npm run compat:mutation` | Parallel with X. |
| **WP-Z** CI lanes (branch-only) | `.github/workflows/oxmutate-*.yml` (new files only) | `changed` lane beside the Stryker job; `full --shard` matrix; SARIF upload. Nothing removes the Stryker job. | `actionlint` plus a `workflow_dispatch` run on the branch | Parallel with X and Y. Needs the integrator to approve the workflow files. |
| **WP-DOG** Dogfood week | `.sdlc/bands/mutation-ratchets.json` (integrator only) | Burgee's `mutation.yml` runs the tool for one week; observation recorded in the existing schema. | SC11, one green week | Calendar-gated. The Stryker job is retired only after it. |

---

## 3. Briefing template (every sub-agent gets this, filled in)

```
WP: <id>            Wave: <n>           Branch: feat/oxmutate/<id>  Worktree: mo-<id>
Goal: <one sentence from the WP row>
Owns (write): <paths>            Reads (never write): spec.md, contracts/*, <inputs>
Do not touch: anything not in Owns, including contracts/* and shared root files.
Check: <command>      Red-state expected: <reason from the WP row>
Done when: check exits 0 on your branch; PR description quotes the red output and the green output.
Open questions: record in the WP's section of open-questions.md, take the default in intent.md, continue.
Stop only if: the check cannot run at all. Say what you tried.
```

## 4. Merge order

1. W0 → `feat/oxmutate`.
2. Wave 1 WPs merge in any order (disjoint paths), each only after its red check is recorded.
3. Wave 2 merges in dependency order: I, J, K, L, N, O, P, Q, M (M after D and E).
4. Wave 3 in any order.
5. W4 integrates; only then Wave 5.

A WP that fails its check after two focused attempts is returned to the integrator with the failing
output. The integrator decides: fix the WP, or revise the spec with a dated note. Agents never
rewrite a spec or a contract to close a WP.

## 5. Critical path and throughput

- **Critical path:** W0 → WP-C → WP-J → WP-I → WP-N → WP-V → W4 → WP-X (measurement). Everything
  else hangs off it.
- **Widest wave:** Wave 1 (eight WPs). Wave 2 has nine. The cap of two install/test agents means
  roughly two WPs run checks at a time; the rest write.
- **Calendar-gated, not agent-gated:** WP-DOG needs a real week. Nothing else waits on it except the
  Stryker job's retirement.

## 6. Risks (with the WP that owns the mitigation)

- **Oxc API churn** (WP-I, WP-J): pin the oxc version in W0; only `crates/operators` and
  `crates/core/src/span_edit.rs` import oxc.
- **Speed comes from the wrong place** (WP-K, WP-L, WP-X): if test-runner time dominates, the fix
  is coverage narrowing (WP-K), not a faster pool. WP-X reports runner time separately.
- **Verdict drift from Stryker** (WP-X): parity is a gate; disagreements are listed, not hidden.
- **False survivors return** (WP-B, WP-K): the SC7 fixture runs in every CI lane.
- **Shared-file collisions** (all): the one-writer rule in §0 and the integrator-only list.
- **Repo fit** (intent Open questions): decided at G0; the layout moves unchanged if the answer is
  a separate repo.
