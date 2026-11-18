# Design — the input adapters

Intent: [`intent.md`](./intent.md). **Status:** approved, 2026-11-18.

---

## Requirements

- **R1** `src/input-<name>.tsindex.ts` exports `adapter: Adapter`; `src/inputs.ts` (created by
  step 6.0) lists them in detection order: `openapi`, `swagger2`, `asyncapi`, `mcp`, `jsonschema`.
  `jsonschema` is last because almost any object is a schema.
- **R2** `detect` reads only top-level keys (`openapi`, `swagger`, `asyncapi`, `tools`, `$schema` or
  `type`/`properties`) and never throws.
- **R3** Every operation's `source` is a JSON Pointer into the document as given, so a finding can
  point at the line the user wrote.
- **R4** Findings: an adapter may return `contract.findings: { code, pointer, message, fix }[]`
  (added to the model by step 6.0, optional, so the existing reader is unchanged).
- **R5** `asyncapi` 3.0: one operation per `operations.<id>`; payload direction is `publish` for
  `action: send`, `subscribe` for `action: receive`. 2.6: `publish`/`subscribe` as declared, with
  the 2.x inversion documented in a finding once per document.
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
