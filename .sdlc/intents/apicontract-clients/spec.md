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

Three file prefixes. `synth` lives in `plugin-msw-synth.ts` (its only user). Order: `fetch`, `msw`, `tanstack-query`.

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

## As built (lane `ac-clients`, 2026-11-18)

Where the design above was wrong or silent, and what was done instead:

- **The model does not carry what a client needs.** Method, path, parameter `style`/`explode`,
  media types and examples are not on `Operation`. `plugin-fetch-routes.ts` reads them from the
  source document at each operation's `source` pointer (as the types target does), and all three
  targets read routes from it, so the client and the mocks cannot disagree about an operation.
- **R1's `input` types come from the types target.** `client.ts` imports `paths` from the path
  option `types` (default `./types.js`), the openapi-fetch model, rather than printing its own
  types: `gen types` must run beside `gen fetch`. Typed per operation as
  `paths[path][method]["parameters"] & { body }`.
- **R3's `unexpected` branch** is `status: 'unexpected'`, not an untyped number, so a `switch` on
  `status` narrows; every branch carries `code` (the status received). `4XX` and `default` are
  their own branches (`status: '4XX'`). `validate` returning errors turns a result into
  `unexpected` with `errors`, never a throw.
- **R4 (TanStack Query)** writes plain `{ queryKey, queryFn }` / `{ mutationKey, mutationFn }`
  objects and imports nothing from TanStack, so one file serves every adapter. Queries resolve to
  the full result union (nothing thrown on a non-2xx, like the client).
- **R5 (MSW):** `scenarios.ts` imports nothing, so any test server can answer from it (the round
  trip does). A `4XX`/`default` scenario answers with the first status in its range no other
  response declares. Values: media `example`, then the first named `examples` value, then the
  schema's `example`/`examples[0]`, then `synth`; only the last is a finding (`value-synthesised`).
- **R6:** `pattern` is not honoured (no formats-table patterns were needed by the fixtures).
- **Samples are literal files** (`plugin-*-sample.ts`), not computed at load: a sample computed by
  `run` is tautological for `checkPlugin`, and code run at import time is classified "static" by
  oxmutate, which then let killable mutants survive.
- **Findings** the client reports instead of dropping: `operation-skipped` (webhooks,
  `additionalOperations`), `parameter-skipped` (`in: querystring`), `style-translated` (`label`,
  `matrix`), `media-type-skipped` (a body's other media types).
- **Not built:** `--compat openapi-fetch` (the types target already emits what openapi-fetch
  reads), SWR, running `handlers.ts` under real MSW and type-checking `queries.ts` against real
  TanStack (corpus lane's consumer harness).
