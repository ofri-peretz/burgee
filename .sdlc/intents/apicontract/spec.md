# Design — `apicontract`

Intent: [`intent.md`](./intent.md) · Metrics: [`metrics.md`](./metrics.md) · Roadmap:
[`roadmap.md`](./roadmap.md). **Status:** draft.

The product is the generator, the extractor and their plugins: spec → code and code → spec ([`D-20261112-apicontract-is-a-generator`](../../decisions/D-20261112-apicontract-is-a-generator.md));
the order things are built in is the roadmap's, not the order of the sections below.

---

## Requirements

### Model

- **R1.** Every adapter maps its spec into one model: a contract is a set of _operations_; each
  operation has a stable id and a set of _payloads_; each payload has a _direction_ (`request`,
  `response`, `publish`, `subscribe`, `tool-call`, `tool-result`, `argv`) and a JSON Schema. The
  direction sits on the payload, not the operation (changed at build, 2026-11-13): one HTTP
  operation carries a request and a response, and R3 decides compatibility per direction.
- **R2.** The core never imports an adapter. An adapter imports only `apicontract/core`.
- **R3.** `diff` decides compatibility per direction. A change is breaking for the **receiver** of
  a payload when it widens what the sender may emit, and breaking for the **sender** when it narrows
  what the receiver accepts. Request/response is two directions of this one rule. Messages use
  schema-registry terms: `BACKWARD`, `FORWARD`, `FULL`, `NONE`.
- **R4.** Every `diff` finding carries an oasdiff-compatible rule id when one exists, a severity, the
  operation id, a JSON Pointer to the change, and a `fix:` line.

### Commands

- **R5.** `gen`, `explain`, `diff`, `check`, `snapshot` and `lint` are burgee declarations, so the
  agent surface is built in, not added later. R-A below is what that means, command by command.
- **R6.** `gen --compat openapi-typescript` accepts openapi-typescript's flags and writes its output
  byte for byte. Fixes to upstream bugs (#941, #1464, #2012, #2366) are behind `--fix-upstream-bugs`.
- **R7.** `explain <id> --json` returns one operation with resolved `$ref`s, in at most 1 KB for the
  median operation of the bench specs.
- **R8.** `diff --since <ref>` reads both sides from git, writes SARIF with `--sarif`, and exits 1 on
  a breaking finding. `diff --changeset` exits 1 when a changeset's bump is below the verdict.
- **R9.** MCP input is a live server (`stdio` through `bellpull`, or HTTP) or a snapshot JSON.
  `snapshot` writes a canonical, sorted, hash-stamped snapshot.
- **R9a.** `apicontract/core` exports types for OpenAPI 3.0, 3.1 and 3.2 documents, name-compatible with
  `openapi-types` (22.98M weekly downloads, last published 2023-05-24), so a project can drop that package.
- **R9b.** Where a protocol's owner ships a breaking-change engine (`buf breaking`, graphql-inspector),
  `diff` spawns the user's own install of it through bellpull and maps its verdicts into the model
  unchanged, adding only the envelope, `fix:` lines, SARIF and MCP. It never re-derives a verdict the
  owner already gives, and the engine is never a dependency (R-DEP1).
- **R10.** `check` scans `fetch`, axios, openapi-fetch, socket emit/on, and MCP `callTool` call sites
  with oxc, and reports each call that does not resolve to an operation, each operation that has no
  caller, and each caller that a pending `diff` breaks.

### Agent surface, built in from burgee (R-A)

Every item is a burgee feature the declaration turns on; none is hand-written in `apicontract`.

- **R-A1 `effects`.** `explain`, `diff`, `check` and `snapshot` declare `effects: 'read_only'`; `gen`
  declares that it writes files. `--mcp` carries this, so an MCP client can auto-approve every read
  and an agent asks no permission to look at a contract.
- **R-A2 Exit codes, burgee's own** (`packages/burgee/src/exit-code.ts`): `0` OK; `1` RUNTIME = the
  command ran and found something (a breaking change, an unknown call site, a lint error); `2` USAGE =
  rewrite the command; `3` CONFIG = an unreadable config or spec; `5` AUTH = a remote spec refused
  the credential; `6` TIMEOUT = a live MCP server did not answer in time. A finding is never `2`.
- **R-A3 The envelope.** Every command answers `--json` with burgee's `{ ok, data, meta }`;
  `meta.provenance` says where each setting came from (flag, env, `apicontract` config, or an
  incumbent's config file read for the drop-in).
- **R-A4 `fix:` lines and `--explain`.** Every finding and every non-zero exit carries a `fix:` line an
  agent can act on as written; `--explain` says which flag, file or rule decided the result.
- **R-A5 Output budget.** `explain` and `diff` honour burgee's `--max-bytes`; past the budget they
  summarise (depth limit) and name the `--expand <pointer>` that returns the rest, rather than
  truncating. `diff` and `check` stream findings as ndjson. This is how A1's p90 (35,762 B) is met.
- **R-A6 `--mcp`.** Every command is an MCP tool with its declaration as the tool schema. No
  command exists only on the CLI.
- **R-A7 `--schema` and `--skill`.** The program publishes its own `--schema`, and ships the Agent
  Skill burgee generates (`--skill`: `SKILL.md` plus `AGENTS.md`, one line and one example per
  command). CI runs `apicontract diff` on its own `--schema` between releases, so the tool holds its
  own contract to the rule it sells.
- **R-A8 Non-TTY first.** Progress uses flagstaff's static projection when stdout is not a terminal,
  and every prompt is a flag first (caique), so a command run by an agent never hangs on input.

### Quint (R-Q)

Behaviour with state, ordering or a lattice is modelled before it is coded. Each model lives beside
its source, runs in `.github/workflows/models.yml` with
`quint run --invariant=safety --max-steps=30 --max-samples=20000`, and its source files are added to
that workflow's `paths:` list.

- **R-Q1 [`compat.qnt`](./compat.qnt).** The compatibility rule of R3. `safety`: a no-op diff is
  `FULL`; reversing a diff swaps `BACKWARD` and `FORWARD`; widening only the receiver keeps
  `BACKWARD`; a sender that emits a value the old receiver rejects breaks `FORWARD`. **Expected
  violation, checked in `models.yml`:** `fullChains`. `FULL` between adjacent versions does not give
  `FULL` between the endpoints (counterexample: A emits {1,2}, B accepts {1,2} and emits nothing, C
  accepts {2}). So `diff --since <ref>` compares the two endpoints and never folds per-commit
  verdicts, and a `--transitive` mode compares every pair, as schema registries' `*_TRANSITIVE`
  modes do.
- **R-Q2 `snapshot.qnt`.** MCP live snapshot sessions: connect, `tools/list` with pagination
  (`nextCursor`), `notifications/tools/list_changed` mid-read, timeout, close. Invariants: a
  snapshot never mixes two catalog versions; a timed-out session leaves no child process (bellpull
  ladder); the snapshot hash is order-independent.
- **R-Q3 [`adapter.qnt`](./adapter.qnt).** The `$ref` resolver's depth-first walk over any reference
  graph (self-references, mutual cycles, diamonds). `safety`: no node twice on the open path, depth
  never above the node count, each frame tracks only its own children, and every root edge handled at
  the end. **Expected violation, checked in `models.yml`:** `everyGraphFinishes`, so the walk is shown
  to finish. The model corrected the first draft: the same edge is inlined on one path and kept as a
  cycle `$ref` on another, so handling is per occurrence, never per edge. Consequence: `explain`
  (inlines) and `gen` (emits named component types) never share an edge-level cache.
- **R-Q4 `guard.qnt`** (with the validator, if its intent finds state to model). Runtime gate: a payload is forwarded only after a passing verdict,
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
- **R-W2.** Every metric in [`metrics.md`](./metrics.md) has a script under `benchmarks/apicontract/`
  that runs both tools on the same subject and machine, and writes a JSON reading to `bench/history/`.

## Design

### Packages — one per purpose (R-P)

Owner direction 2026-11-07: **one package per purpose, as in the rest of the burgee family**,
**everything that can be an extension is one**, and **code generators are extensions of the main
CLI** (`apicontract gen nest`, `apicontract gen ts`). A technology extension
does more than generate: it also reads the spec back out of that technology and finds the entry
points that violate it, so `apicontract check` can gate CI (R-TE). Names are working names (`apicontract-*`); the final
names are chosen before the first publish ([`phase0.md`](./phase0.md)).

| Package | Purpose | Extension points it hosts | Lands |
| :-- | :-- | :-- | :-- |
| `@interlace/contract-model` (internal) | The protocol-neutral model, `$ref` resolver (`adapter.qnt`), and the extension API (`defineAdapter`, `defineEmitter`, `defineReader`, `defineRule`) | Protocol adapters: OpenAPI, JSON Schema, AsyncAPI, MCP, OpenRPC, … | Phase 1 |
| `apicontract-diff` | What breaks and for whom, under a chosen mode and side; `explain` (a resolved, size-capped slice for agents) | Diff rules (oasdiff rule ids built in) | Phase 5 |
| `apicontract-extract` | **Code → spec.** Hosts readers; emits OpenAPI 3.1/3.2, AsyncAPI 3, JSON Schema 2020-12 | Readers: Standard Schema (Zod, Valibot, ArkType), TypeBox, NestJS decorators, Hono, tRPC/oRPC | Phase 2 |
| `apicontract-schema` | The contract-first front door of our own validator ([`validator/intent.md`](../validator/intent.md)): validators compiled from the model (R-SC); absorbs the old `guard` | — | Phase 2 |
| `apicontract-check` | Call sites in code that disagree with the contract; native oxc core as oxmutate ships | Call-site matchers (HTTP, socket, MCP) | Phase 7 |
| `apicontract` | The main CLI: one install, one `--mcp`, one `--skill` for agents. Owns `gen` (**spec → code**) and dispatches to whichever purpose packages are installed; a missing one fails with a `fix:` line naming the install | **Code generators** (emitters) | Phase 1 |
| `apicontract-gen-ts` | Generator extension of the main CLI: TypeScript types (`--compat openapi-typescript`), the openapi-typescript migration path | — | Phase 1 |
| `apicontract-zod` | Technology extension (R-TE): the spec from Zod, and drift between them. It reads Zod and never generates it (R-SC0) | — | Phase 2 |
| `apicontract-nest` | Technology extension (R-TE): NestJS modules from OpenAPI and AsyncAPI (R-NE), the spec from NestJS, and entry points that violate the spec | — | Phase 3 |

**Extensions (R-EX).**

- **R-EX1.** Every purpose package is a host: the built-ins are written against the same public
  extension API a third party uses (the TypeScript generator is an extension like any other, OpenAPI is an adapter), so
  the API is exercised by our own code from day one.
- **R-EX2.** An extension is a package that exports a `define*` declaration; its commands and flags
  register through burgee's `definePlugin`, so they appear in `--help`, `--json`, `--mcp` and
  `--skill` with no extra code.
- **R-EX3.** The extension API is versioned; a host refuses an extension built for a newer major with
  a `fix:` line. Its shape is locked by a declaration test, like burgee's public surface.
- **R-EX4.** A new protocol, emitter, reader or rule never needs a new purpose package and never needs
  a core change (the kill rule in [`roadmap.md`](./roadmap.md) applies).
- **R-EX5. Anyone can build a plugin, and so do we.** Our own generators and technology extensions
  (`apicontract-gen-ts`, `apicontract-zod`, `apicontract-nest`, `apicontract-mcp`, …) are plugins
  written only against the public API, published the same way a third party would. Nothing ours
  reaches an internal the public API does not expose; a lock fails the build if one does.
- **R-EX6. One plugin object, the family's contract.** A plugin is the family's plain object
  (`plugin-contract`): burgee reads its `commands` and `hooks`, apicontract reads `generators`,
  `readers`, `detectors`, `adapters` and `rules`, and each host ignores keys it does not own, so one
  plugin can extend the CLI and the model at once.
- **R-EX7. Explicit loading.** Plugins load from the `plugins` list in the project's config file,
  never by scanning `node_modules`: a plugin runs code in CI, so the repo names every one it trusts.
  An unknown or failing plugin stops the run with a `fix:` line; it is never skipped silently.
- **R-EX8. A kit for plugin authors.** `apicontract plugin new <name>` scaffolds a plugin with its
  tests; `apicontract/testing` ships a conformance suite every plugin runs (generate → extract round
  trip, regeneration touches no user lines, detect finds seeded violations), and our own plugins
  pass the same suite.
- **R-EX9. Findable.** Plugins are published as `apicontract-<tech>` (ours) or with the
  `apicontract-plugin` keyword (anyone's); `apicontract plugin list` and `--mcp` show what is
  loaded and which capabilities (generate, extract, detect) each one provides.

**Technology extensions (R-TE).** One package per technology, each implementing any of three
capabilities against the model:

- **R-TE1 `generate`** — spec → code for that technology (`apicontract gen <tech>`).
- **R-TE2 `extract`** — code → spec (`apicontract extract --from <tech>`).
- **R-TE3 `detect`** — finds that technology's entry points (NestJS controllers, gateways and message
  handlers; Hono or Express routes; MCP server tools; client call sites) and reports where they
  violate the contract. Matchers are declared to the static core (`apicontract-check`), so detection
  needs no app boot and no network.
- **R-TE4** A capability an extension lacks is reported by `--help` and `--json`, never silently
  skipped.

**CI gate (R-CI).** `apicontract check` is what people run in CI for spec violations:

- **R-CI1.** Violations have stable rule ids (below) and a `fix:` line each; output as text, `--json`,
  SARIF and GitHub annotations.
- **R-CI2.** A baseline file lets a repo adopt the gate without fixing history first: only new
  violations fail. `--changed <ref>` limits the run to touched files.
- **R-CI3.** Exit codes: 0 clean, 1 violations, 2 a usage or config error. The `diff` breaking-change
  verdict runs in the same pass when a base ref is given.

| Rule id | Violation |
| :-- | :-- |
| `undocumented-entry` | A route, handler, gateway event or MCP tool in code with no operation in the spec |
| `missing-implementation` | An operation in the spec with no entry point in code |
| `param-mismatch` | Path, query, header or body parameters differ in name, type or required-ness |
| `response-mismatch` | A returned shape or status code the spec does not declare |
| `unvalidated-input` | An entry point that accepts input without the spec's schema applied |
| `auth-mismatch` | A security scheme in the spec that the entry point does not enforce, or the reverse |
| `call-site-mismatch` | A client call that sends or expects what the spec does not allow |
| `breaking-change` | The `diff` verdict against the base ref, under the chosen mode and side |
| `generated-edited` | A hand edit inside a generated region (R-BL2) |
| `missing-synthetic` | An operation with no synthetic check, an orphaned check, or a stale one (R-SY2) |
| `<plugin>/<rule>` | A contract-aware lint rule from a plugin (R-BL3) |

**The contract is the baseline (R-BL).** Every piece of generated or detected code is mapped back to
the contract, so CI tooling and lint rules can aim at exactly those areas.

- **R-BL1. A contract map.** Every generator writes a map: for each operation, channel or tool, the
  files and symbols it produced (base controller, DTO, validator, client method) and the user-owned
  symbol that implements it, found by `detect`. The map is regenerated in CI and committed or cached,
  never hand-edited.
- **R-BL2. Generated code stays generated.** A hand edit inside a generated region is a violation
  (`generated-edited`) with a `fix:` line pointing to the spec change or the user-owned subclass.
- **R-BL3. Contract-aware lint rules.** A rule selects code through the contract, not through file
  globs: "every handler of an operation with `security: admin` calls the audit hook", "no handler of
  a `payments` operation returns a raw error", "every MCP tool validates its input". Selectors read the
  spec (tags, security, extensions such as `x-*`, protocol) and resolve through the map to the
  symbols. Rules are a plugin key (`rules`, R-EX6), so anyone can write them.
- **R-BL4. Works with the linters people already run.** The map also emits scoped overrides for
  oxlint and ESLint (the generated files, the user-owned handlers), so existing rules can be turned
  up or down on exactly those areas without our engine.
- **R-BL6. Forwards-only by default.** As Optic did for the spec, and nobody does for code: a rule
  applies to operations added or changed since the baseline ref, with a separate, looser ruleset for
  legacy ones, so the first run on an old repo reports nothing on untouched operations and nobody
  writes an ignore file to adopt it.
- **R-BL7. Findings point at code people own.** A finding's SARIF location is the handler line, with
  the spec location as a related location; never only a YAML line.
- **R-BL8. Spec and code drift in one diff.** A PR fails when the spec diff and the handler diff
  disagree (a field removed in code but still in the spec, or the reverse).
- **R-BL9. Migrate governance in.** `apicontract check` reads `.spectral.yaml`, Redocly's lint config
  and Optic's `optic.yml` rulesets, so a team keeps its standards and gains code reach.
- **R-BL5. One CI run.** `apicontract check` runs detect, the contract-aware rules and `diff` in one
  pass and reports them together (SARIF, `--json`, baseline file, R-CI).

**Synthetic checks from the contract (R-SY).** Researched 2026-11-07: no tool generates a complete
synthetic suite from a contract and keeps it in sync. Checkly's OpenAPI import is UI-only with no
assertions or re-sync; Step CI generates the happy path and has not been pushed since 2024-08;
Schemathesis validates against the spec but only in CI; nobody monitors AsyncAPI channels or MCP
tools. We generate for the incumbents rather than build a runner (R-DEP1: the runner stays the
user's install).

- **R-SY1. Generator plugins.** `apicontract gen checkly` (API checks, check groups and Playwright
  suites), `gen playwright`, `gen k6`, and Terraform for Datadog and Grafana: one check per operation
  and per documented status code, auth from `securitySchemes` through environment variables, every
  response validated against the spec with an inlined generated validator.
- **R-SY2. `missing-synthetic` rule.** `apicontract check` fails on an operation with no check, an
  orphaned check, or a check generated from an older spec.
- **R-SY3. AsyncAPI and MCP.** Channels become publish/subscribe checks and MCP tools become
  `tools/call` checks, which no incumbent offers.
- **R-SY4. `apicontract probe`.** A `fetch`-only smoke run for CI with no dependencies; scheduling and
  probe locations stay with the incumbent.

**Round trip (R-RT): spec → code and code → spec, mastered together.**

- **R-RT1.** `extract(gen(spec))` is equal to `spec` after normalisation, for every document in the
  corpus (JSON-Schema-Test-Suite 2020-12, the OpenAPI and AsyncAPI example sets, our own fixtures).
- **R-RT2.** `gen(extract(code))` type-checks against the original code's call sites.
- **R-RT3.** Both are a Quint model (`roundtrip.qnt`) before code, and a property test with an
  oxmutate floor after.

**Runtime schema (R-SC).** Owner direction 2026-11-11 ([`D-20261111-apicontract-own-validator`](../../decisions/D-20261111-apicontract-own-validator.md)): **we do not
use Zod; the validator is our own and has to be state of the art.**

- **R-SC0.** Zod is never a dependency, a peer, or generated output of any package here. It is an
  incumbent we read (code-first input, R-SC4) and migrate users off, graded by its own suite (R-C2).
  "State of the art" is a measured bar, not a description: parity on the incumbents' suites first,
  then the R metrics in [`metrics.md`](./metrics.md) against ajv, Zod 4, Valibot, ArkType and typia,
  same script, subject and machine, losing numbers published.

- **R-SC0a.** The validator is a product of its own, with a code-first authoring API and its own
  intent ([`validator/intent.md`](../validator/intent.md)). R-SC1–R-SC4 are its contract-first side;
  this spec does not define a second engine.

Not "another Zod": interop is now Standard Schema (NestJS 12, tRPC, oRPC
and Hono accept it), so a new API surface buys nothing.

- **R-SC1.** Validators are compiled ahead of time from the model, and implement Standard Schema and
  Standard JSON Schema, so they work wherever Zod works, with no shim.
- **R-SC2.** Types are emitted as plain interfaces: no type-level computation, so `tsc` stays cheap.
- **R-SC3.** Errors carry the JSON Pointer, the schema keyword and the spec location in a stable JSON
  shape, readable by an agent.
- **R-SC4.** Migration from Zod: existing Zod schemas are code-first input to `apicontract-extract`
  (no rewrite needed), and `apicontract-schema migrate --from zod` is a codemod for teams that want
  to drop Zod. Refinements and transforms that JSON Schema cannot express are reported per site,
  never dropped silently.

**JSON Schema output (R-JS).** For a team that validates with ajv and wants nothing of ours at runtime.

- **R-JS1.** `gen json-schema` writes one JSON Schema per payload (request body, parameters, each
  response), `$ref`s resolved or bundled by choice, in draft 2020-12 or draft-07, the draft ajv reads
  by default.
- **R-JS2.** OpenAPI keywords JSON Schema does not have (`nullable`, `discriminator`,
  `readOnly`/`writeOnly` by direction) are translated, and each translation that loses meaning is
  reported, never dropped silently.
- **R-JS3.** The output compiles in the user's own ajv, unchanged; ajv is never a dependency (R-DEP1).

**NestJS (R-NE).** Researched 2026-11-07: no stable, regeneration-safe NestJS generator exists
(openapi-generator `typescript-nestjs-server` and the hey-api Nest plugin are beta; nothing for
AsyncAPI).

- **R-NE1.** Generates abstract base controllers, gateways and microservice handlers that the user's
  classes extend; regeneration changes zero lines of user code.
- **R-NE2.** Validation defaults to Standard Schema through NestJS 12's `@Body({ schema })`;
  class-validator DTOs are an option for NestJS 11 codebases.
- **R-NE3.** One AsyncAPI document yields both a WebSocket gateway and a microservice handler.
- **R-NE4.** Every generated operation ships with a contract test.

**Competitor tracking and native migration (R-C).** As burgee does for commander and yargs:

- **R-C1.** Every purpose package carries a `competitors.json` (`compat`, `weight`, `surface` claims)
  and joins the daily `compat-upstream` watch, so a competitor's release arrives as an issue and a
  diff on that file.
- **R-C2.** Migration claims are graded by the competitor's own tests through compat-oracle, never
  ours alone: openapi-typescript's snapshot suite (`gen --compat`), oasdiff's fixtures (diff rule
  ids), zod-to-openapi's and @nestjs/swagger's fixtures (`extract`), Zod's suite on the subset
  `migrate --from zod` claims.
- **R-C3.** Each purpose package has a `migrate --from <competitor>` path for its top incumbents
  (oasdiff, openapi-diff and Optic's `optic diff --check` for `diff`; openapi-typescript, orval, hey-api for `gen`; Zod for `schema`; @nestjs/swagger, zod-to-openapi
  for `extract`). A competitor release that breaks a graded migration is fixed within the band set
  in `control-bands.json`.

### Phase 1 design: the plugin object (R-PL)

Written 2026-11-12 for the first thing built: `gen`, the plugin API and the TypeScript types
generator. It applies the family's contract ([`plugin-contract`](../plugin-contract/spec.md))
rather than inventing one, so a plugin author who has written a flagstaff component already knows
the shape.

- **R-PL1. `apicontract` is the next host of the family contract.** It gets `src/plugin.ts` and the
  family's byte-identical `src/schema.json`, `CONTRACT = 1`, and the family's error codes
  (`E_PLUGIN_SCHEMA`, `E_PLUGIN_CONTRACT`, `E_NO_STATIC_PROJECTION`, `E_NO_CONTRIBUTION`). The keys
  it reads are `adapters` (an input format) and `generators` in Phase 1, `extractors` in Phase 2,
  `rules` and `detectors` later. Every other key passes through untouched, so one plugin object can
  also carry burgee `commands`.
- **R-PL2. A generator is data plus one function.**
  `{ name, description, inputs, options, sample, run }`. `inputs` names the formats it accepts
  (`openapi`, `jsonschema`, `asyncapi`). `options` are burgee option declarations, so a generator's
  flags appear in `--help`, `--schema` and `--mcp` with no code. `run` is the only function, which
  is what the family's R7 allows: a named member the schema describes and the host calls.
- **R-PL3. `run` returns files; it never writes them.** `run(model, options)` returns
  `{ path, content, owner }[]` (it may return a promise). The host writes. That puts dry runs,
  `--check` (fail when the files on disk differ from what would be generated), the diff an agent
  reads, and overwrite safety in one place, not in every plugin.
- **R-PL4. Who owns a file is declared.** `owner: 'generated'` is rewritten on every run and edits
  to it are a finding (R-BL2). `owner: 'user'` is written once, as a starting point, and never
  touched again. This is the whole mechanism behind "regeneration changes zero user lines" (N1),
  and it is the host's, so every generator gets it.
- **R-PL5. `sample` is the generator's static projection (PRINCIPLES rule 6).** A small spec and
  the exact files it produces, as plain data. A generator without one is refused with
  `E_NO_STATIC_PROJECTION`. `apicontract check <plugin>` runs `run` on the sample twice and
  compares both results with the declared files, byte for byte, so it proves the output is what
  the author says and that it is deterministic. This is the check behind X3: an agent given the
  schema and one example writes a plugin that passes it in one turn.
- **R-PL6. Built-ins take no private path.** The TypeScript types generator and the OpenAPI adapter
  are registered through the same `register()` and pass the same `check`. A lock fails the build
  when either imports anything the public plugin entry does not export (X1, R-EX5).
- **R-PL7. Loading is explicit and failure is loud** (R-EX7). `gen <target>` resolves a generator by
  name from the `plugins` list in the project's config. An unknown target fails with a `fix:` line
  that lists the installed generators and the install command for the missing one.
- **R-PL8. The family schema grows by two keys, in its own PR.** `generators` and `adapters` join
  `schema.json` as additive `$defs`; the contract stays 1. That PR touches every host's copy
  (`npm run schema:sync`), adds `apicontract` to the routing table behind `burgee check`
  (plugin-contract R9), and is held by the existing byte-identity and schema-agreement locks.

**Found at build, 2026-11-13.** The family locks find a host by the file `src/plugin.ts`, and a host
they find must already be in the shared schema, in `burgee check`'s routing table and have a bin
with a `check` command. So step 3 lands the host as `src/host.ts`, internal, and R-PL8 is the PR
that renames it to `plugin.ts`, adds `adapters` and `generators` to every host's `schema.json`,
routes both keys in `burgee check`, and ships `apicontract check <plugin>`. That PR changes nine
published packages' schema copies and burgee's source, so it carries changesets and its release is
the owner's to merge.

Build order, one PR each, each with a check proven to fail first:

1. The model and the `$ref` resolver, with `adapter.qnt` already modelling the walk.
2. The OpenAPI adapter, as a plugin.
3. The plugin host: `plugin.ts`, the schema PR (R-PL8), `apicontract check`.
4. The TypeScript types generator, as a plugin, with openapi-typescript's fixtures vendored into
   `compat-oracle` and a control run proving the gate (G1).
5. `--compat openapi-typescript` flags and the migration codemod.

Two defaults taken here, standing since the accept of 2026-11-13
([`D-20261113-apicontract-build-go-ahead`](../../decisions/D-20261113-apicontract-build-go-ahead.md)): a generator's options are
burgee option declarations, not a free-form JSON Schema; and `run` may be asynchronous.

### Experiment: one CLI for all protocols vs one CLI per protocol (X-1)

Both ship from the same codebase, so the experiment measures which front door gets attention, not
which code is better.

- **Arm A: one CLI.** `apicontract` covers every protocol (the table above).
- **Arm B: one dedicated CLI per protocol.** A thin package per protocol (working names, e.g. an
  OpenAPI one, an AsyncAPI one, an MCP one; final names chosen with the product name) whose bin is a
  burgee program built from the same commands, restricted to that protocol's adapter. It depends on
  `apicontract`; it contains no logic of its own, so a fix lands in both arms at once.
- **Each dedicated CLI must be a working tool** (its own `--help`, `--mcp`, `--skill`, scoped to the
  protocol), not a redirect: npm's policy prohibits name squatting and spam packages.
- **Signals, per arm and per protocol:** weekly downloads net of CI (a download whose dependent
  is the other arm is counted once), GitHub referrers, docs-page search impressions and clicks
  (Search Console, one landing page per protocol), issues opened, MCP installs.
- **Caveats recorded up front:** users pick an arm, they are not assigned, so the result says which
  name and framing people search for, not which structure is better; young-package download counts
  are noisy, so no reading before 90 days.
- **Decision rule at 90 days:** a dedicated CLI that draws under ~5% of the all-protocol CLI's net
  installs is deprecated with a pointer to `apicontract`; one that draws more than the all-protocol
  CLI for its protocol stays and gets its own docs section. The core never forks either way.
- **Starts** when Phase 2 ships (OpenAPI, JSON Schema), and each later protocol joins as its adapter
  lands. Publishing any arm-B package needs the owner's approval.

### Dependencies

- **R-DEP1.** Runtime dependencies come only from the burgee family, as in every other package of
  the repo: `apicontract` → `burgee`, `seniority` (`/yaml`), `bellpull` (MCP stdio and owners'
  engines); `apicontract-check` → its own platform binaries, with oxc compiled into the native core
  as oxmutate ships it; `apicontract-schema` → nothing; extensions → their host and the model. An outside tool is reached only by spawning
  the user's install or as an optional peer. So the `$ref` resolver, the OpenAPI document types, the
  TypeScript emitter and the validator are ours — never `@apidevtools/swagger-parser`,
  `openapi-types`, `typescript` or `ajv`. Gate: a script fails CI when any `packages/apicontract*`
  manifest lists a dependency outside the family.

### Emitter

Output is built from string templates over the model, never `ts.factory`. A golden-file suite pins
output, and `compat-oracle` runs openapi-typescript's own fixtures through both tools.

## Verification

- `npm run ci:local` — typecheck, tests and build, including the golden files.
- `.github/workflows/models.yml` — every `.qnt` above, `--invariant=safety`.
- `npx oxmutate run --since origin/main` — the floors in `mutation-ratchets.json`.
- `compat-oracle` — openapi-typescript fixtures (SC1) and the oasdiff corpus (SC10).
- `npm run bench -- apicontract` — every metric in [`metrics.md`](./metrics.md).

## Rejected alternatives

- **One package per spec type.** Same bundle win as subpaths, at N times the release, docs and
  version-skew cost.
- **A separate core library package now.** Its only consumers would be hypothetical. Add it when a
  second tool embeds the core.
- **Generating with `ts.factory` or a bundled TypeScript.** That is the exact failure in #2841, and it
  triples install size.
- **A YAML dependency.** `seniority/yaml` is already in the family.
- **Building a mock server, Pact-style consumer tests, or publishable SDK generation.** (Narrowed
  2026-11-13: generating MSW handlers and generating MCP servers were in this list and are now
  generator plugins, [`D-20261113-apicontract-mocks-and-mcp-generation`](../../decisions/D-20261113-apicontract-mocks-and-mcp-generation.md).) Mature tools (Prism,
  MSW, Pact, Stainless, Speakeasy) own those jobs; `apicontract` feeds them a contract instead. SDK
  generation stays out for a second reason: it is what Speakeasy and Stainless sell, and they fund the
  free OpenAPI tooling around it (Speakeasy is a Gold sponsor of openapi-typescript). Staying
  complementary keeps `apicontract` sponsorable by them ([`landscape.md`](./landscape.md)).
- **Reimplementing protobuf or GraphQL breaking-change rules.** Buf and The Guild own them and ship
  weekly; R9b wraps them instead.

## Out of scope

Runtime HTTP clients (openapi-fetch keeps working on our output), GraphQL native parsing before
someone asks for it, a hosted service, and any UI.
