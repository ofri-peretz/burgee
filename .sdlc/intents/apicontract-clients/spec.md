# Design — client and mock generators

Intent: [`intent.md`](./intent.md). **Status:** approved, 2026-11-18.

---

## Requirements

- **R1** `src/plugin-fetch*.ts` exports `generators.fetch`; output `client.ts` with
  `createClient({ baseUrl, fetch?, headers?, validate? })` returning one method per operation.
- **R2** Path params are encoded with `encodeURIComponent`; query arrays follow the spec's `style`
  and `explode` (form/explode default); bodies by media type (`application/json`, form, multipart).
- **R3** The return type is `{ status, body, headers }` per declared response, plus a typed
  `unexpected` branch; nothing throws on a non-2xx.
- **R4** `src/plugin-tanstack-query*.ts` imports the `fetch` output by path option `client`.
- **R5** `src/plugin-msw*.ts` emits `handlers.ts` (`http.<method>(path, resolver)`) and `scenarios.ts`;
  values come from `example`, then `examples[0]`, then a seeded synthesis over the schema.
- **R6** The synthesiser is a pure function `synth(schema, seed)` honouring `enum`, `const`,
  `format`, `minimum`/`maximum`, `minLength`, `pattern` (only for the formats table), and `$ref`.

## Design

Three folders. `synth` lives in `msw/` (only user). Order: `fetch`, `msw`, `tanstack-query`.

## Verification

`npm test -w apicontract -- src/plugin-fetch src/plugin-msw src/plugin-tanstack-query`;
the round-trip test (client against a server built from the mock scenarios) is the check that would
catch the client and mocks disagreeing.

## Rejected alternatives

- **A runtime client library** (openapi-fetch's model). The output is the library; nothing to install.
- **Faker for mock data.** A dependency, and non-deterministic without care.

## Out of scope

Publishable SDK packages (rejected 2026-11-06, stands). Retries, auth refresh, pagination helpers
(a team's conventions plugin, per vision row 5).
