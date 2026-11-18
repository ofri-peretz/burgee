# Design — `apicontract gen` and `extract`

Intent: [`intent.md`](./intent.md). **Status:** approved, 2026-11-18.

---

## Requirements

- **R1** `loadConfig(cwd)` finds `apicontract.config.{json,mjs,ts}` and returns `{ input, plugins,
  targets: { [name]: { generator, out, options } } }`, validated with a `fix:` line per error.
- **R2** `loadPlugins(config)` imports each entry of `plugins` (package name or relative path), runs
  `host.validate` on it, and merges the built-ins from `src/plugins.ts` first.
- **R3** `readInput(path, overlays)` parses JSON or YAML, applies the config's `overlays` with
  `applyOverlays` from `input-overlay.ts` when that lane has landed, asks each adapter's `detect` in registration order
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
- **R9** `extract --from <extractor> [--out spec.json]` runs an extractor (the host's `Extractor`,
  added in 6.0: `run(options)` returns a document) and writes through the same `plan`.

## Design

`run-config.ts`, `run-load.ts`, `run-input.ts`, `run-plan.ts`, `run-apply.ts`, `run-header.ts`,
`run-map.ts` and `run-command.ts` (the burgee declarations for `gen` and `extract`). `cli.ts` imports
`run-command.ts` in place of the `planned` stubs. Order:
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

## Found at build, 2026-11-18

What the code does where this design was silent or wrong; each is held by a test in `src/run-*.test.ts`.

- **JSON has no comments, so it has no header.** `run-header.ts` writes the header for `.ts/.tsx/.mts/.cts/.js/.jsx/.mjs/.cjs`
  (`//`), `.yaml/.yml` (`#`) and `.md` (`<!-- -->`); any other file is written as its body alone, and its body hash is
  recorded in `apicontract.map.json` instead. R7's map therefore has a third key, `files: { [path]: { target, sha } }`,
  which is also what R5 reads to know a file is apicontract's to delete.
- **Symbols need a field.** `GeneratedFile` gains optional `symbols: { operation, symbol }[]` (validated by
  `validateFiles`); the map is built from it. A generator that omits it still has its files hashed and deleted safely.
- **`changed` is a boolean.** burgee refuses an `idempotent` command whose result lacks `changed: true | false` (N7), so the
  report carries `changed` (boolean) and `changes` (the count the intent calls "0 changed").
- **No adapter exits 3, not 2.** R3 said 2; R-A2 says an unreadable spec is `3` CONFIG, and the host's `PluginError` already
  maps there. Unknown `--target` and a missing `--from` are the `2` USAGE cases.
- **Adapter order is the host's.** R3 said "first adapter in registration order"; the host resolves later-wins, like a
  generator name, and `gen` goes through the host rather than a second rule.
- **Overlays are refused, not ignored, while `input-overlay.ts` is a stub**: a config listing `overlays` exits 3 with a fix.
- **`extract` takes its defaults from a config key** `extract: { from, out, options }`; the flags override `from` and `out`.
  The config is optional for `extract`. Only `.json` output is written: there is no YAML writer in the package.
- **`host.run`** returns `{ files, findings }` (reader findings first), and **`host.extractor(name)`** resolves like
  `host.generator`; `gen` reports findings per target instead of dropping them.
- **An extractor reports findings too** (gap `A-20261118-extractor-findings-channel`, 2026-11-18). `Extractor.run` may
  return `{ document, findings }`, as a generator may return `{ files, findings }`; `documentOf` in `host.ts` splits it
  beside `resultOf` (only an object with both keys is a result, since a spec may carry a `document` key of its own).
  `extract` writes the document and hands the findings to `commit` under the target `extract`, so they appear in the
  text output and in the `--json` envelope's `data.findings` exactly as `gen`'s do. `checkPlugin` and the `roundtrip`
  rule compare the document part only.
- **No `cwd` in a burgee handler**, so the commands read `process.cwd()`; tests pass `--config` or stub `process.cwd`.
