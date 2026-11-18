# Design — `apicontract gen` and `extract`

Intent: [`intent.md`](./intent.md). **Status:** approved, 2026-11-18.

---

## Requirements

- **R1** `loadConfig(cwd)` finds `apicontract.config.{json,mjs,ts}` and returns `{ input, plugins,
  targets: { [name]: { generator, out, options } } }`, validated with a `fix:` line per error.
- **R2** `loadPlugins(config)` imports each entry of `plugins` (package name or relative path), runs
  `host.validate` on it, and merges the built-ins from `src/plugins.ts` first.
- **R3** `readInput(path)` parses JSON or YAML, asks each adapter's `detect` in registration order
  and returns the first adapter's `Contract`. No adapter → exit 2 with the formats it knows.
- **R4** `plan(files, disk)` is pure: given generated files and what is on disk, it returns `write`,
  `skip` (user file exists), `unchanged`, `conflict` (hand edit in a generated file) per path.
- **R5** `apply(plan)` writes atomically (temp file, rename) and never deletes a file it did not
  generate in the previous map.
- **R6** The header carries `sha256(body)` truncated to 12 hex digits; a mismatch is `conflict`.
- **R7** `apicontract.map.json`: `{ version: 1, operations: { [id]: [{ file, symbol, target }] } }`,
  sorted keys; written by `gen`, read by `check`, `diff` and the contract-test plugins.
- **R8** Flags: `--check`, `--dry-run`, `--force`, `--target <name>` (repeatable), `--config <path>`.
  `gen` declares `effects: 'idempotent'`.
- **R9** `extract --from <plugin> [--out spec.json]` runs an extractor (`extractors` key on the
  plugin, same shape as a generator but returning a document) and writes through the same `plan`.

## Design

`run-config.ts`, `run-load.ts`, `run-input.ts`, `run-plan.ts`, `run-apply.ts`, `run-header.ts`,
`run-map.ts` and `run-command.ts` (the burgee declarations for `gen` and `extract`). `cli.ts` imports
`run-command.ts` in place of the `planned` stubs. `host.ts` gains the `extractors` key (R9) with the same `sample` rule as generators. Order:
R4 and R6 first (pure, tested exhaustively), then R1–R3, then R5, R7, R8, R9.

## Verification

`npm test -w apicontract -- src/run-` exits non-zero on any failing requirement; the
regeneration-safety test (intent § Success criteria) is the check that would have caught a
generator overwriting user code. `npm run ci:local` before the push.

## Rejected alternatives

- **Per-plugin file writing.** Eight copies of the safety rules, and N1 measured eight times.
- **Markers inside files to fence user regions** (openapi-generator's approach). Users edit across
  fences and lose code; separate `user` files are the boundary instead.
- **Discovering plugins from `node_modules`.** Implicit, slow under endpoint scanners, and a supply
  chain hazard (R-EX7).

## Out of scope

Watch mode. Remote specs over HTTP (a later `--input https://…` reads through bellpull, if asked).
