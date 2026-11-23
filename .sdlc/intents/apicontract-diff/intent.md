# Intent — `apicontract diff`: what a contract change breaks, for whom, in every format the model reads

> Opened from the 2026-11-18 program ([`../apicontract/program.md`](../apicontract/program.md)).
> Roadmap Phase 5 (diff half) and Phase 6's no-spec-file diff. The compatibility rule is already
> modelled in [`../apicontract/compat.qnt`](../apicontract/compat.qnt) (R-Q1); oasdiff rule ids were
> chosen in [`D-20261106-apicontract-diff-rule-ids`](../../decisions/D-20261106-apicontract-diff-rule-ids.md).

**Status:** approved · **Opened:** `2026-11-18` · **Owner:** `@ofri-peretz` · **Lane:** `ac-diff` ·
**Accepted by:** [`D-20261118-contracts-program-go-ahead`](../../decisions/D-20261118-contracts-program-go-ahead.md)

---

## What is wanted

`apicontract diff <old> <new>` where each side is a file, a `git:<ref>:<path>`, or an MCP snapshot;
both read through the same adapters, compared on the model, per payload direction:

- a request schema that accepts less is breaking for callers; a response schema that returns more is
  breaking for callers; publish/subscribe and tool-call/tool-result follow the same lattice;
- `--mode backward|forward|full` and `--side caller|server` choose what counts;
- findings carry oasdiff's rule id where one exists, a `fix:` line, and a SARIF location;
- `--changeset` writes a changeset whose bump follows the verdict;
- exit 1 on any breaking change under the chosen mode.

## Why now

`D1`–`D7` have no reading. MCP servers change tool schemas silently (SC10: find ≥ 1 real case in ten
popular servers). The diff is model-level, so it covers OpenAPI, JSON Schema, AsyncAPI and MCP at
once, which no incumbent does (`D5`: oasdiff 1, mcpdiff 1).

## Affected users and systems

`packages/apicontract/src/diff-*.ts`, `src/command-diff*.ts`.

## Constraints

- The classifier implements `compat.qnt`'s lattice exactly; the Quint traces are its spec oracle
  under oxmutate (R-M2).
- No dependency on oasdiff; its corpus is read as test data in the corpus lane.
- A schema keyword the classifier does not understand is reported as `unknown-change`, never as
  compatible.

## Success criteria

- `D1`: verdict agreement with oasdiff on its own test corpus, each disagreement explained in a file.
- `D2` = 0 missed planted breaks; `D3` below each incumbent on the planted corpus.
- `D5` = 4 at this intent's exit (OpenAPI, JSON Schema, AsyncAPI, MCP).
- `D6` ≥ 1: one unannounced breaking change found in the histories of the ten MCP servers.
- `D7`: `compat.qnt` invariants green in `models.yml`; Q2 reported.

## Defaults taken

- Default mode `backward`, default side `caller`.
- Text output groups by operation; `--json` is a flat list sorted by severity, then pointer.

## Evidence sweep 2026-11-22

Read on `main` at `daee10f` (2026-11-22) against the merged Wave 6 PRs (#1617–#1653) and the committed readings under `benchmarks/apicontract/results/`; `vitest run` in `packages/apicontract` (2,545 tests) and `packages/validator` (1,153) is green there. None of the 5 criteria is fully met: `D7`'s Quint half holds, but Q2 has no reading. Every corpus reading (`D1`, `D2`, `D3`, `D6`) is unread, and `D5` lacks an AsyncAPI document diffed end to end.

| # | criterion | held by | state |
| --: | :-- | :-- | :-- |
| 1 | `D1`: verdict agreement with oasdiff on its own corpus, disagreements explained | rule ids mapped (`src/diff-rules.ts`, 91 rows); not graded on oasdiff's corpus | **open** |
| 2 | `D2` = 0 missed planted breaks; `D3` below each incumbent | no planted corpus. Gap [`A-20261118-diff-false-breaking-equivalent-rewrites`](../../gaps/A-20261118-diff-false-breaking-equivalent-rewrites.md) still open on its corpus clause | **open** |
| 3 | `D5` = 4 (OpenAPI, JSON Schema, AsyncAPI, MCP) | every side reads through the built-in adapters; command tests diff an MCP snapshot and a JSON Schema pair end to end; AsyncAPI only on hand-built contracts | **open**: one AsyncAPI document test |
| 4 | `D6` ≥ 1 unannounced break in ten MCP servers' histories | no snapshots (see `apicontract-inputs`) | **open** |
| 5 | `D7`: `compat.qnt` invariants green in `models.yml`; Q2 reported | `models.yml` runs every tracked `.qnt` (`compat.qnt`, `compat-traces.qnt`) and the `fullChains` vacuity check; the 384 trace pairs are a property test in `diff-classify.test.ts` | **open**: the Quint half holds; Q2 (mutants killed only by the traces, `apicontract/metrics.md`) needs a mutation run, and the ratchet is `unmeasured` |
| 6 | Note: `git:<ref>:<path>` is refused with a `fix:` | apicontract does not depend on bellpull yet (spec § As built R4) | a gap in "Phase 6's no-spec-file diff", not a criterion |

Status stays `approved`: `apicontract` is `private` and unpublished, and [`D-20261119-apicontract-stays-private`](../../decisions/D-20261119-apicontract-stays-private.md) reserves `shipped` for published work; a lane that meets every criterion is recorded as "criteria met, unpublished".
