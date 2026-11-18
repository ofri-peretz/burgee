# Design — conformance suite, scaffold, migrations

Intent: [`intent.md`](./intent.md). **Status:** approved, 2026-11-18.

---

## Requirements

- **R1** `src/testing.ts` exports `conformance(plugin, options?)`: async, throws a
  `ConformanceError` listing every failed rule (not only the first), each with a `fix:` line.
- **R2** Rules, each its own function and test: `schema` (host.validate), `sample` (run on
  `sample.document` equals `sample.files`), `deterministic`, `regeneration` (mutates the sample
  document by adding one operation and one property, regenerates through the spine's `plan`, asserts
  no `user` file changes), `roundtrip` (when `options.extractor` is given), `fix-lines`
  (refusals carry `fix:`), `paths` (all paths pass `validateFiles`).
- **R3** `src/scaffold*.ts` holds the scaffold template as plain TypeScript strings; `plugin new`
  writes them through the spine's `apply`.
- **R4** `src/migrate-<from>.ts` each exports `migrate(configText, files) → { config, edits, findings }`;
  pure, tested on fixtures copied from the incumbent's docs with their source URL in a comment.
- **R5** `migrate` and `plugin` commands are declared in `src/command-*.ts` stubs created by 6.0.

## Design

R1–R2 first (other lanes adopt the suite as soon as it lands), R3, then R4 in the order
openapi-typescript, openapi-fetch, hey-api, orval. Until the spine's `plan` lands, `regeneration`
uses an in-lane copy of the owner rule and switches in a follow-up.

## Verification

`npm test -w apicontract -- src/testing src/migrate- src/scaffold`; the seven broken
fixture plugins are the check that would catch a rule that passes everything.

## Rejected alternatives

- **A separate `apicontract-testing` package now.** One more package before the naming pass; the
  subpath export is enough until then.
- **Migrating by running the incumbent.** Needs it installed; configs are data and read as data.

## Out of scope

Migrating from openapi-generator (Java templates; on request) and from Speakeasy/Stainless configs.
