# Design — the diff engine

Intent: [`intent.md`](./intent.md). **Status:** approved, 2026-11-18; built, see § As built.

---

## Requirements

- **R1** `compareSchemas(a, b, direction) → Change[]`: pure, keyword by keyword (type, enum,
  required, properties, additionalProperties, items/prefixItems, min/max*, pattern, format, const,
  oneOf/anyOf/allOf, nullable via type arrays, `$ref` by resolved target with cycle guard).
- **R2** Each `Change` is `{ rule, pointer, before, after, effect: 'widens' | 'narrows' | 'unknown' }`;
  `classify(change, direction, mode, side)` maps it to `breaking | non-breaking | unknown` per
  `compat.qnt`.
- **R3** `compareContracts(a, b)` matches operations by id (then, for OpenAPI, by method and path
  read from the operation's `source` pointer, `/paths/<path>/<method>`), reports
  added and removed operations, and compares payloads by name.
- **R4** Readers for `git:<ref>:<path>` use `git show`; MCP snapshots read through the `mcp` adapter.
- **R5** Output: text, `--json` (burgee envelope), `--sarif`; `--changeset <package>` writes
  `.changeset/<hash>.md`.
- **R6** Rule ids: oasdiff's where the change matches one (table in `src/diff-rules.ts` with the
  oasdiff id and our id side by side), ours prefixed `ac-` otherwise.

## Design

`src/diff-schema.ts` (R1), `src/diff-classify.ts` (R2), `src/diff-contract.ts` (R3), `src/diff-rules.ts` (R6);
`src/command-diff.ts` holds the command and output formatting (R4, R5). Order: R1 + R2 against
`compat.qnt` traces first, then R3, R6, R4, R5.

## Verification

`npm test -w apicontract -- src/diff- src/command-diff`; a property test reads schema
pairs from `compat.qnt` traces generated once with Quint and committed under
`src/__fixtures__/diff/traces/` (no Quint at test time) and checks R2 agrees; the planted-break corpus (corpus lane) gates `D2`.

## Rejected alternatives

- **Text diff of the spec.** Misses every `$ref`-moved and reordered change; flags formatting.
- **Running oasdiff as a subprocess.** OpenAPI only, and a Go binary outside the family.

## Out of scope

`lint` (Phase 9). protobuf and GraphQL diffs (owners' engines, Phase 8).

## As built (lane `ac-diff`, 2026-11-18)

What landed, and where it departs from the design above. Each departure is a decision the
reviewer at Deploy should accept or send back.

- **R1** `src/diff-schema.ts`. Every keyword R1 lists, plus `const` (read as a one-value `enum`)
  and OpenAPI 3.0's `nullable`. A `$ref` with sibling keywords is merged with its target when no
  keyword clashes (the same intersection), else the target moves under `allOf`. Cycles stop on
  the pair of references open on the path. `readOnly` properties are skipped in directions the
  server receives, `writeOnly` in those it sends: that is the only use of `direction` here.
- **R2** `src/diff-classify.ts`. **Departure:** `Change.effect` has a fourth value, `neutral`:
  an optional property (or parameter) declared or dropped where undeclared ones are allowed. Under
  pure set semantics that narrows a request, which would make every new optional request
  property breaking; every OpenAPI diff treats it as compatible, and so does this one. It always
  classifies `non-breaking`.
- **R2 semantics of `--mode` and `--side`.** `backward` keeps `--side` on the old contract and
  the other party on the new one; `forward` moves `--side` first; `full` is both. Each payload's
  `compat.qnt` rule then follows from whether its sender is the old party (BACKWARD) or the new
  one (FORWARD), `payloadRules()`. **Where the design was loose:** for two-party payloads the
  pair is redundant, `--mode backward --side server` asks exactly what `--mode forward --side
  caller` asks (a test pins it). `--side` is kept because it is the word a reader asks in.
- **Traces.** `compat.qnt` holds no verdict in its state, so
  [`compat-traces.qnt`](./compat-traces.qnt) imports it and records `{ old, nu, verdict }` per
  state, the verdicts computed by `compat.qnt`'s own `backward`/`forward`/`full`. Generated once
  with Quint 0.33.0 (command in that file's header): 24 traces, 384 pairs, committed under
  `packages/apicontract/src/__fixtures__/diff/traces/`. `diff-classify.test.ts` checks, on every
  pair, that `compareSchemas` reads BACKWARD and FORWARD as Quint does (`s ⊆ r` through `enum`
  schemas), and on every single-schema pair that `classify` agrees with `compat.qnt` for all 7
  directions × 3 modes × 2 sides, plus `reversalSwaps`.
- **R3** `src/diff-contract.ts`. Operations by id, then by route from `source` (`#/paths/<p>/<m>`,
  path-parameter names ignored); renamed path parameters paired in order. Adding or removing an
  operation is judged in the direction it is called in (`response` → `request`, `publish` →
  `subscribe`, `tool-result` → `tool-call`). A body or response that appears or disappears is
  `false` on the missing side, so a new response status **widens the response and is breaking
  for old callers**; oasdiff calls it informational. That and `response-success-status-removed`
  (breaking in oasdiff, non-breaking here: the server sends less) are the first D1 disagreements
  to file.
- **R4 Departure: `git:<ref>:<path>` is refused by the shipped command** with a `fix:` naming the
  `git show` to run. Spawning a subprocess is bellpull's job (`scripts/inline-implementation-lock.test.ts`)
  and apicontract does not depend on bellpull; adding it is a `package.json` + lockfile edit,
  the integrator's. `diff()` takes a `GitReader`, tested with a fake; wiring bellpull's `run` in
  is one line once the dependency exists. MCP snapshots read through `inputs.ts`, so they work as
  soon as the `mcp` adapter (PR #1621) lands; until then only OpenAPI documents are detected.
- **R5** text grouped by operation, `--json` (burgee envelope: verdict, summary, findings sorted
  by verdict then location), `--sarif` (SARIF 2.1.0 as the text output, and under `data.sarif`),
  `--changeset <package>` (`.changeset/apicontract-diff-<sha8>.md`; breaking or unknown → major,
  else minor; nothing written when nothing changed). **Departure:** exit 1 on `unknown` as well
  as `breaking`, since the intent's constraint says an unknown change is never compatible.
  **Open question:** the command is declared `read_only` (fixed in `cli.test.ts`) yet
  `--changeset` writes a file.
- **R6** `src/diff-rules.ts`: 91 rows, ours beside oasdiff's per place (parameter, body,
  property, request or response). The ids are from oasdiff's documentation and not yet graded
  on its corpus (D1, corpus lane). **Inconsistency:** `D-20261106` says `cp-` for our ids; this
  spec and the code say `ac-`. The decision record needs the one-word correction.

### Not done here

D1–D7 readings (corpus lane; MCP histories for D6), `diff --since <ref>`, `compat.qnt` in
`models.yml`, and reading MCP snapshots, JSON Schema and AsyncAPI end to end (adapters in #1621;
the engine is tested on hand-built contracts in those directions).
