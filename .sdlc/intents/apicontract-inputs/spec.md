# Design — the input adapters

Intent: [`intent.md`](./intent.md). **Status:** approved, 2026-11-18.

---

## Requirements

- **R1** `src/input-<name>.ts` exports `adapter: Adapter`; `src/inputs.ts` (created by
  step 6.0) names them in detection order: `openapi`, `swagger2`, `asyncapi`, `mcp`, `jsonschema`.
  `jsonschema` is last because almost any object is a schema.
- **R2** `detect` reads only top-level keys (`openapi`, `swagger`, `asyncapi`, `tools`, `$schema` or
  `type`/`properties`) and never throws.
- **R3** Every operation's `source` is a JSON Pointer into the document as given, so a finding can
  point at the line the user wrote.
- **R4** Findings: an adapter returns `contract.findings` (`ContractFinding[]` in `core/model.ts`,
  added by step 6.0, optional, so the existing reader is unchanged).
- **R5** `asyncapi` 3.0: one operation per `operations.<id>`; payload direction is `publish` for
  `action: send`, `subscribe` for `action: receive`. 2.6: read from the application's side as well,
  so 2.x `publish` (what the application receives) is `subscribe` and 2.x `subscribe` is `publish`,
  with one finding per document saying so
  ([`D-20261118-asyncapi-direction`](../../decisions/D-20261118-asyncapi-direction.md)).
- **R6** `mcp`: operation id = tool name; `inputSchema` → `tool-call`, `outputSchema` (if present) →
  `tool-result`; prompts' `arguments` become a `tool-call` object schema with a finding that it was
  synthesised.
- **R7** `swagger2`: body and `formData` parameters → one request payload per consumes type;
  `definitions` → `components.schemas` pointers rewritten; `x-nullable` → `type: [T, "null"]`.
- **R8** OpenAPI 3.2 additions in `src/openapi.ts` read with their 3.1 equivalents' directions.

## Design

One file per adapter, `input-<name>.ts` with `input-<name>.test.ts`, fixtures in
`src/__fixtures__/inputs/<name>/`. Shared helpers stay in each adapter's own files (duplicated rather than shared across lanes, until a third copy
earns a `core` helper through the spine lane). Order: `jsonschema` (unblocks `ac-validate`),
`mcp` (unblocks `ac-agents`), `asyncapi`, `swagger2`, OpenAPI 3.2.

## Verification

`npm test -w apicontract -- src/input- src/openapi` and the corpus lane's
`benchmarks/apicontract/corpus.ts --adapters` reading (0 thrown documents is the gate).

## Rejected alternatives

- **Using `@apidevtools/swagger-parser` or `@asyncapi/parser`.** Runtime dependencies outside the
  family (G4) and a second reading of `$ref`.
- **One adapter per version** (asyncapi2, asyncapi3). Users do not choose by version; `detect` does.

## Out of scope

Writing documents back in a format (that is `extract` and the `gen openapi` target). Remote `$ref`
fetching (refused with a `fix:` line naming `bundle` first).

## As built (2026-11-18, lane `ac-inputs`)

All five adapters and Overlay landed, with OpenAPI 3.2 in `openapi.ts`. Each reads the format's own
example or test documents, unchanged, from `src/__fixtures__/inputs/<name>/` (sources and licences
in each folder's `SOURCES.md`), with zero thrown errors:

| Adapter | Documents read | Graded on |
| :-- | --: | :-- |
| `jsonschema` | 46 | JSON-Schema-Test-Suite `ref.json`, `ref-legacy.json`, `anchor.json`; every `$ref` in the 27 documents it reports nothing for resolves through `core/resolve.ts` |
| `mcp` | 30 | the MCP specification's 9 `Tool`/list examples; 21 github-mcp-server tool snapshots |
| `asyncapi` | 45 | every `asyncapi/spec` example at v2.6.0 (21) and v3.0.0 (24); 127 payloads checked against the send/receive rule |
| `swagger2` | 28 | the OpenAPI Specification's 8 Swagger 2.0 examples; 20 swagger-codegen 2.0 test documents, the Swagger Petstore among them |
| overlay | 33 | all 8 Overlay compliant sets produce their `output.yaml`; the 25 schema-test overlays apply |

Where the build departs from the design above, and why:

- **R2, detection.** `jsonschema` also recognises `$id`, `$ref`, `$defs` and `definitions`, and
  reads `type` only when it names JSON types, so `{ "type": "Feature" }` is not a schema. `mcp`
  looks one level into a JSON-RPC response's `result`, and reads one tool on its own
  (`{ name, inputSchema }`), the shape servers commit as tool snapshots.
- **R5, AsyncAPI 2.x directions.** Built as written: 2.x verbs are read as declared, with one
  finding per document. This makes the same API read in opposite directions as 2.6 and as 3.0, so a
  `diff` across a 2.6 → 3.0 migration would see every operation flip. Reading 2.x from the owner's
  side (`subscribe` → `publish`) would remove that; it needs a decision, since R5 says otherwise.
- **R6, MCP.** Resource templates (`resources/templates/list`) read as `resource:<uriTemplate>`,
  prompts as `prompt:<name>`, so neither collides with a tool name. A tool with `inputSchema: null`
  (two github-mcp-server snapshots) reads as `{ "type": "object" }` with a finding.
- **R7, Swagger 2.0.** `input-swagger2.ts` imports `read` from `openapi.ts` (same lane) instead of
  importing only the core: the 3.1 form is read by the one OpenAPI reader rather than a second copy.
  The contract's `document` is the 3.1 form, so `#/components/schemas/…` references in payloads
  resolve against it; operation `source` pointers are unchanged by the conversion. Beyond R7's list,
  boolean `exclusiveMinimum`/`exclusiveMaximum` (draft-04) become numbers, with a finding.
  A schema `$ref` into another file (`./loadBalancer.json#/definitions/X`) is kept as written and
  reported as `ref-external` (2026-11-18, gap `A-20261118-types-external-refs-dangle`); it is never
  rewritten to a local-looking `#/components/schemas/X`. `apicontract gen` bundles the spec's sibling
  files before any adapter reads it (`run-input.ts` → `gen-ts-bundle.ts`), so a spec whose siblings
  are present reaches the adapter as one document.
- **Overlay.** `applyOverlays(document, overlays)` keeps the signature 6.0 gave it and returns only
  the document. `apply(document, overlay)` also returns findings (a target that matches nothing, an
  action with no effect): the spine's `--overlay` should call `apply` so a stale overlay is reported.
  JSONPath is our own RFC 9535 subset; slices and function extensions are refused with a `fix:`.
- **R8, OpenAPI 3.2.** `additionalOperations` are read after the named methods; `itemSchema` adds a
  `…:item` payload; a parameter described by `content` (3.2's `in: querystring` always is) is read
  by its media type's schema, which also fixes 3.0/3.1 `content` parameters, read as `true` before.
  Tags as objects carry nothing into the model.

Not done here, each needing another lane's output: the `tools/list` snapshots of the ten SC10
servers (none publishes one; taking them is the corpus lane's snapshot step), the 50 corpus
Swagger 2.0 documents (the corpus lane's pin list), and reading a folder of schemas (the spine's
loader walks the folder; each file is one document to this adapter).
