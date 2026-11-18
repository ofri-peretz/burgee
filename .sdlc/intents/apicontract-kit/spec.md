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

## Build notes (lane `ac-kit`, 2026-11-18)

What the build found that this design did not say, for the reviewer at Deploy:

- **`regeneration` runs on an in-lane copy of the owner rule** (`src/testing-owner.ts`), as planned:
  `run-plan.ts` is in PR #1619. `plugin new` and `migrate` write through the same copy, not the
  spine's `apply`. Both switch in a follow-up once #1619 lands.
- **The host's types had no public subpath.** `Plugin`, `Generator`, `Contract` and the rest are
  re-exported from `apicontract/testing`, which the scaffold imports. A `./host` export (or the
  root) is the better home; that is the spine's call.
- **`paths` and `fix-lines` need probes, not only the sample.** A generator that names files by
  operation id passes its own sample; the suite also runs it on the sample plus an operation whose
  id is `../conformance-probe`, and on the contract with no operations, and checks those runs.
- **`plugin new` is `plugin <action> <name>`** with `action` limited to `new`, not a subcommand: a
  group declares no `effects`, and `cli.test.ts` holds `plugin` to `idempotent` in `--schema`.
- **`out` in `apicontract.config.json`** is written as the incumbent's own output path, a file for
  one-file output and a folder otherwise; the gen-command spec does not say which. The types target's
  compat option is written `options.compat: 'openapi-typescript'`, which the types lane has not fixed.
- **openapi-fetch is not an import rewrite.** Its calls go by method and path (`client.GET("/x")`);
  the `fetch` target has one method per operation (clients R1). The migration rewrites the import and
  the `createClient<paths>` call, and reports every call site, by line, as a finding.
- **Not done here:** the skill and the X3 eval case (`evals/` belongs to the integrator).
