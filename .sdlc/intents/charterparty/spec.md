# Design — `charterparty`

Intent: [`intent.md`](./intent.md) · Metrics: [`metrics.md`](./metrics.md) · Roadmap:
[`roadmap.md`](./roadmap.md). **Status:** draft.

---

## Requirements

### Model

- **R1.** Every adapter maps its spec into one model: a contract is a set of _operations_; each
  operation has a stable id, a _direction_ (`request`, `response`, `publish`, `subscribe`,
  `tool-call`, `tool-result`, `argv`), and a JSON Schema for each payload.
- **R2.** The core never imports an adapter. An adapter imports only `charterparty/core`.
- **R3.** `diff` decides compatibility per direction. A change is breaking for the **receiver** of
  a payload when it widens what the sender may emit, and breaking for the **sender** when it narrows
  what the receiver accepts. Request/response is two directions of this one rule. Messages use
  schema-registry terms: `BACKWARD`, `FORWARD`, `FULL`, `NONE`.
- **R4.** Every `diff` finding carries an oasdiff-compatible rule id when one exists, a severity, the
  operation id, a JSON Pointer to the change, and a `fix:` line.

### Commands

- **R5.** `gen`, `explain`, `diff`, `check` and `lint` are burgee declarations. Each emits the burgee
  `--json` envelope, publishes `--schema`, is served through `--mcp`, and uses burgee exit codes.
- **R6.** `gen --compat openapi-typescript` accepts openapi-typescript's flags and writes its output
  byte for byte. Fixes to upstream bugs (#941, #1464, #2012, #2366) are behind `--fix-upstream-bugs`.
- **R7.** `explain <id> --json` returns one operation with resolved `$ref`s, in at most 1 KB for the
  median operation of the bench specs.
- **R8.** `diff --since <ref>` reads both sides from git, writes SARIF with `--sarif`, and exits 1 on
  a breaking finding. `diff --changeset` exits 1 when a changeset's bump is below the verdict.
- **R9.** MCP input is a live server (`stdio` through `bellpull`, or HTTP) or a snapshot JSON.
  `snapshot` writes a canonical, sorted, hash-stamped snapshot.
- **R10.** `check` scans `fetch`, axios, openapi-fetch, socket emit/on, and MCP `callTool` call sites
  with oxc, and reports each call that does not resolve to an operation, each operation that has no
  caller, and each caller that a pending `diff` breaks.

### Quint (R-Q)

Behaviour with state, ordering or a lattice is modelled before it is coded. Each model lives beside
its source, runs in `.github/workflows/models.yml` with
`quint run --invariant=safety --max-steps=30 --max-samples=20000`, and its source files are added to
that workflow's `paths:` list.

- **R-Q1 `compat.qnt`.** The compatibility lattice of R3. Invariants: a breaking change composed with
  any change is still breaking; `FULL` holds exactly when both `BACKWARD` and `FORWARD` hold; reversing
  a diff swaps sender-breaking and receiver-breaking; a no-op diff is `FULL`.
- **R-Q2 `snapshot.qnt`.** MCP live snapshot sessions: connect, `tools/list` with pagination
  (`nextCursor`), `notifications/tools/list_changed` mid-read, timeout, close. Invariants: a
  snapshot never mixes two catalog versions; a timed-out session leaves no child process (bellpull
  ladder); the snapshot hash is order-independent.
- **R-Q3 `adapter.qnt`.** Adapter → model → `gen` → re-read. Invariant: an operation id is stable across
  re-reads, and `$ref` cycles terminate.
- **R-Q4 `guard.qnt`** (Phase 5). Runtime gate: a payload is forwarded only after a passing verdict,
  and a schema swap mid-stream never validates a message against a mix of two schemas.

### oxmutate (R-M)

- **R-M1.** Each package has a floor in `.sdlc/bands/mutation-ratchets.json`, starting at its first
  measured score and ratcheting up, never down.
- **R-M2.** The `diff` classifier runs with a **spec oracle**: oxmutate scores its mutants against
  ITF traces from `compat.qnt` as a second verdict, so a mutant that unit tests miss but that breaks a
  lattice law is still killed.
- **R-M3.** The PR lane runs `oxmutate run --since origin/main`. A change that weakens tests fails
  through `--frozen-oracle`.
- **R-M4.** A survivor in the classifier, the `$ref` resolver or the snapshot hash blocks the release,
  not only the score.

### Weight and metrics

- **R-W1.** Each public subpath has a bundled-bytes and install-size ceiling in
  `.sdlc/bands/foundation-ceilings.json`.
- **R-W2.** Every metric in [`metrics.md`](./metrics.md) has a script under `benchmarks/charterparty/`
  that runs both tools on the same subject and machine, and writes a JSON reading to `bench/history/`.

## Design

### Packages

| Package | Contents | Why it is separate | Lands |
| :-- | :-- | :-- | :-- |
| `charterparty` | CLI (bin) and library. Subpaths: `/core` (model, `$ref`, diff engine), `/gen`, `/openapi`, `/jsonschema`, `/mcp`, `/asyncapi`, … one per adapter | — (the default home) | Phase 1 |
| `charterparty-check` | oxc call-site scanner, prebuilt `.node` per platform, as oxmutate ships | A native binary: users of `gen`/`diff` must not download it | Phase 4 |
| `charterparty-guard` | Runtime validator for MCP tool calls and WebSocket/SSE messages, compiled from the model | Ships inside apps: bundle bytes are the product | Phase 5, on demand |

The split rule: **separate by dependency weight and audience, never by spec type.** Adapters are pure
TypeScript and tree-shake through subpaths. A new package is only justified by a native binary, code
that ships into apps, or a release cadence that differs from the CLI. `charterparty` loads `burgee` only
from its bin entry, so library imports (`charterparty/core`) pull no CLI code. The CLI lazy-loads
`charterparty-check` when it is installed and otherwise fails `check` with a `fix:` line naming the
install command.

### Dependencies

`charterparty` → `burgee`, `seniority` (`/yaml`), `bellpull` (MCP stdio). `charterparty-check` → its
platform binaries. `charterparty-guard` → nothing.

### Emitter

Output is built from string templates over the model, never `ts.factory`. A golden-file suite pins
output, and `compat-oracle` runs openapi-typescript's own fixtures through both tools.

## Verification

- `npm run ci:local` — typecheck, tests and build, including the golden files.
- `.github/workflows/models.yml` — every `.qnt` above, `--invariant=safety`.
- `npx oxmutate run --since origin/main` — the floors in `mutation-ratchets.json`.
- `compat-oracle` — openapi-typescript fixtures (SC1) and the oasdiff corpus (SC3).
- `npm run bench -- charterparty` — every metric in [`metrics.md`](./metrics.md).

## Rejected alternatives

- **One package per spec type.** Same bundle win as subpaths, at N times the release, docs and
  version-skew cost.
- **A separate core library package now.** Its only consumers would be hypothetical. Add it when a
  second tool embeds the core.
- **Generating with `ts.factory` or a bundled TypeScript.** That is the exact failure in #2841, and it
  triples install size.
- **A YAML dependency.** `seniority/yaml` is already in the family.
- **Building mocking, Pact-style consumer tests, or SDK/MCP-server generation.** Mature tools (Prism,
  MSW, Pact, Stainless, Speakeasy) own those jobs; `charterparty` feeds them a contract instead.

## Out of scope

Runtime HTTP clients (openapi-fetch keeps working on our output), GraphQL native parsing before
someone asks for it, a hosted service, and any UI.
