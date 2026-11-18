# Design — the diff engine

Intent: [`intent.md`](./intent.md). **Status:** approved, 2026-11-18.

---

## Requirements

- **R1** `compareSchemas(a, b, direction) → Change[]`: pure, keyword by keyword (type, enum,
  required, properties, additionalProperties, items/prefixItems, min/max*, pattern, format, const,
  oneOf/anyOf/allOf, nullable via type arrays, `$ref` by resolved target with cycle guard).
- **R2** Each `Change` is `{ rule, pointer, before, after, effect: 'widens' | 'narrows' | 'unknown' }`;
  `classify(change, direction, mode, side)` maps it to `breaking | non-breaking | unknown` per
  `compat.qnt`.
- **R3** `compareContracts(a, b)` matches operations by id (then by method+path for OpenAPI), reports
  added and removed operations, and compares payloads by name.
- **R4** Readers for `git:<ref>:<path>` use `git show`; MCP snapshots read through the `mcp` adapter.
- **R5** Output: text, `--json` (burgee envelope), `--sarif`; `--changeset <package>` writes
  `.changeset/<hash>.md`.
- **R6** Rule ids: oasdiff's where the change matches one (table in `src/diff/rules.ts` with the
  oasdiff id and our id side by side), ours prefixed `ac-` otherwise.

## Design

`src/diff/` holds `schema.ts` (R1), `classify.ts` (R2), `contract.ts` (R3), `rules.ts` (R6);
`src/commands/diff/` holds the command and output formatting (R4, R5). Order: R1 + R2 against
`compat.qnt` traces first, then R3, R6, R4, R5.

## Verification

`npm test -w apicontract -- src/diff src/commands/diff`; a property test generates schema
pairs from `compat.qnt` traces and checks R2 agrees; the planted-break corpus (corpus lane) gates D2.

## Rejected alternatives

- **Text diff of the spec.** Misses every `$ref`-moved and reordered change; flags formatting.
- **Running oasdiff as a subprocess.** OpenAPI only, and a Go binary outside the family.

## Out of scope

`lint` (Phase 9). protobuf and GraphQL diffs (owners' engines, Phase 8).
