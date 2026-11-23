# Intent — `contractdiff diff` as deep as the registries, and selection for agents

> Opened from [`D-20261122-verification-toolkit`](../../decisions/D-20261122-verification-toolkit.md) and
> the 2026-11-22 landscape ([`../../research/contract-landscape-2026-11-22.md`](../../research/contract-landscape-2026-11-22.md)):
> what Confluent, Apicurio, buf, GraphQL Inspector and Hive do that our `diff` does not, and the one
> agent gap in spec → MCP.

**Status:** approved · **Opened:** `2026-11-22` · **Owner:** `@ofri-peretz` · **Lane:** `ac-diff` ·
**Accepted by:** [`D-20261122-toolkit-intents-accepted`](../../decisions/D-20261122-toolkit-intents-accepted.md)

---

## What is wanted

- **R1. Transitive compatibility.** `diff --transitive <ref-range | dir>`: check the new contract
  against every earlier release in the range, not only the last (Confluent's `_TRANSITIVE`, Glue's
  `_ALL`). The report names the oldest release each finding breaks.
- **R2. A `dangerous` verdict.** Between non-breaking and breaking: a change that is compatible by the
  schema but breaks a common reader, e.g. a new enum value read by an exhaustive switch, a field made
  nullable in a response (GraphQL Inspector's three levels). `--dangerous-breaking` promotes it.
- **R3. Usage-aware verdicts.** `--usage <file>`: a list of the operations and members callers use (a
  call log, a client's contract map, Hive-style). Removing a member nobody uses is `non-breaking` with a
  note; touching one that is used keeps its verdict and names the caller.
- **R4. Frozen contracts.** A `x-frozen: true` marker (Glue's `DISABLED`): any change under it is
  breaking regardless of mode.
- **R5. Protobuf levels, when protobuf is read.** buf's FILE ⊃ PACKAGE ⊃ WIRE_JSON ⊃ WIRE as a
  `--level` for formats with a wire encoding.
- **R6. Operation selection for agents.** `gen mcp --select <tag|x-mcp|pointer> --budget <tokens>`:
  only the operations an agent should see, with the tool list's size reported against the budget.
  The default selection excludes operations tagged internal or health.
- **R7. Agent-quality lint ruleset.** `contractdiff:agent-ready` for `lint`: every operation and
  parameter described, descriptions under a length cap, examples valid, no two operations with
  near-identical descriptions (the confusions that break generated tools).

## Why now

The landscape found each of R1–R5 in one incumbent and none across formats; we have one model under
every format, so each lands once and works for OpenAPI, AsyncAPI, JSON Schema events and MCP alike.
R6 and R7 are the two agent gaps reported with evidence (tool bloat; spec quality as the bottleneck).

## Constraints

- Every verdict change is warn-first (R2, R3) and never changes an existing verdict by default.
- R3's usage file is data the user provides; contractdiff never collects telemetry.

## Success criteria

- R1: a three-release fixture where the change is compatible with the last release and breaks the
  first; transitive mode fails it, plain mode passes it.
- R2: the enum-addition fixture is `dangerous`, and breaking with the promotion flag.
- R6: on the corpus's largest OpenAPI document, `--budget 4000` produces a tool list under 4,000 tokens.

## Rejected

- **A registry server.** Packages, never services: the "registry" is git history and a directory of
  releases.
