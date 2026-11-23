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
- **R1, equivalent rewrites** `src/diff-normalise.ts` (gap
  [`A-20261118-diff-false-breaking-equivalent-rewrites`](../../gaps/A-20261118-diff-false-breaking-equivalent-rewrites.md)).
  Both sides, and every followed `$ref` target, are written in one spelling before the keyword
  walk: `{ not: {} }` as `false`; a value list naming every value of `null` or `boolean` as that
  type (`const: null` is `type: null`); `anyOf` of bare types as one type list, of bare value lists
  as one `enum`, of tuples of each length m..n as one tuple with `minItems: m` (`oneOf` likewise,
  only where no value can match two branches); `allOf` and a one-branch `anyOf`/`oneOf` merged into
  the parent unless a keyword is set two ways, a part has a `$ref`, or a keyword would be moved
  apart from one it reads (`properties`/`additionalProperties`, `prefixItems`/`items`, `contains`,
  `if`/`then`/`else`, `unevaluated*`); a `pattern` that is the validator's pattern for a JSON Schema
  format (date, date-time, time, duration, email, hostname, ipv4, ipv6, uuid) as that format, which
  is what `format` means in this family. Against a peer that declares a type, an untyped value list
  is read as the types of its values; against a peer that lists values, a `null`/`boolean` type as
  its values. **Departure:** a `$ref` with sibling keywords now always goes under `allOf` and is
  merged back by the rule above; the old flat merge put `additionalProperties` beside a target's
  `properties` it cannot see. `Change.pointer` and `before`/`after` now point into the normalised
  form (a merged `allOf` branch's change reads at the parent).
  **Reading, 2026-11-18** (the extract lane's five-document corpus through the validator and back,
  `compareContracts`): **1 / 5 non-breaking before, 5 / 5 after.** The four were `type: null` as
  `const: null` (scalars); an `allOf` split of one array schema and a tuple as `anyOf` of its
  lengths with `items: { not: {} }` (collections); an enum as `allOf` of its type and `anyOf` of
  `const`, and `anyOf` with `const: null` (choices); a format as its pattern (formats). Each shape
  and a near miss that narrows are tests in `diff-normalise.test.ts`; the `compat.qnt` trace
  property is unchanged and green. Not read: the corpus lane's full corpus (D3), which has no
  documents on main yet.
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
  `packages/contractdiff/src/__fixtures__/diff/traces/`. `diff-classify.test.ts` checks, on every
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
  is one line once the dependency exists. Every side reads through `inputs.ts`'s built-in adapters, so
  OpenAPI, Swagger 2.0, AsyncAPI, MCP snapshots and JSON Schema are all diffed; the command's
  tests read an MCP `tools/list` snapshot and a JSON Schema pair end to end.
- **R5** text grouped by operation, `--json` (burgee envelope: verdict, summary, findings sorted
  by verdict then location), `--sarif` (SARIF 2.1.0 as the text output, and under `data.sarif`),
  `--changeset <package>` (`.changeset/apicontract-diff-<sha8>.md`; breaking or unknown → major,
  else minor; nothing written when nothing changed). **Departure:** exit 1 on `unknown` as well
  as `breaking`, since the intent's constraint says an unknown change is never compatible.
  `--changeset` writes a file, the same file for the same input, so the command's effect is
  `idempotent`, and its result already reports `changed` (burgee N7)." The declaration says so, and
  `cli.test.ts` pins it (an integrator change, since that file is the spine's). SARIF locations are URI references: a
  relative path with `/`, an absolute one as a `file:` URL.
- **R6** `src/diff-rules.ts`: 91 rows, ours beside oasdiff's per place (parameter, body,
  property, request or response). The ids are from oasdiff's documentation and not yet graded
  on its corpus (D1, corpus lane). Our prefix is `ac-`, recorded in
  [`D-20261118-apicontract-diff-rule-prefix`](../../decisions/D-20261118-apicontract-diff-rule-prefix.md),
  which replaces the `cp-` half of `D-20261106`.

### Not done here

The D1–D5 readings (corpus lane), the unannounced MCP break in ten servers' histories (SC10), `diff --since <ref>`, `compat.qnt` in
`models.yml`, and an AsyncAPI document diffed end to end (the engine is tested on hand-built
publish/subscribe contracts).
