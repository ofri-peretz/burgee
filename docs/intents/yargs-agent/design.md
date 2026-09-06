# Design — `yargs-agent`

Intent: [`intent.md`](./intent.md). **Status:** draft.

---

## Requirements

The same R1–R12 as [`commander-agent/design.md`](../commander-agent/design.md), met
through yargs' surface. Only the mapping differs:

| yargs API | Layer use |
| :-- | :-- |
| `.exitProcess(false)` | the lifecycle owns exit (E1, O5) |
| `.fail((msg, err) => …)` | `msg` without `err` → `USAGE`; `err` → `RUNTIME` or the `CliError.exitCode` (E1–E3) |
| `.showHelpOnFail(false)` | E2 |
| `.middleware(fn, true)` (before validation) | builds `ctx`, reads `--json`, `--schema`, sets output mode (O1, O2, F1) |
| `.middleware(fn)` (after validation) | injects `ctx` into `argv` as `argv.ctx` for handlers (O3) |
| `.option('json', { hidden: true })`, `.option('schema', …)` at root | O1, F1 |
| `.getHelp()` | text help from the node, rendered by the layer (F2) |
| `.parserConfiguration({ 'strip-dashed': true, 'camel-case-expansion': true })` | one canonical key set in the envelope |
| `internals.ts` → `getInternalMethods().getCommandInstance().getCommandHandlers()` | command enumeration for the manifest, behind a version guard (yargs 17–18) |

Handlers keep `(argv)`; `argv.ctx` carries `out`, `runtime`, `json`, and a handler's
return value (yargs awaits promise-returning handlers under `parseAsync`) becomes
`data`.

### Allowed manifest diff

`--schema` on the two demos may differ in: `options[].negate` (yargs derives `--no-x`
for every boolean; commander only when declared), `arguments[].variadic` spelling
(`[files..]` vs `<files...>` normalised by the layer to `variadic: true`), and
`aliases` ordering. Everything else identical; the conformance suite diffs the two with
that allow-list.

## Verification

- Shared conformance suite parameterised over both demos (intent 1); every commander
  case runs on yargs unchanged.
- `internals.lock.test.ts`: `getInternalMethods` appears only in `src/internals.ts`; the
  version guard throws a `CliError` with a `fix` on an unsupported yargs major.
- Manifest diff test with the allow-list above.

## Rejected alternatives

- **Re-implementing command registration to avoid internals.** That is a parser.
- **Parsing `--help` text to discover commands.** Brittle and the exact thing F1 exists
  to end.
- **Waiting for upstream before shipping.** The internals exist in every 17.x and 18.x
  release; the guard plus the upstream PR is the honest trade.

## Out of scope

- yargs' own `.env()`, `.completion()`, `.showHidden()` — reused, not re-layered.
- yargs 16 and below.
