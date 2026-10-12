# Design — What a commander or yargs program already declares reaches every surface

Intent: [`intent.md`](./intent.md). **Status:** approved.

**Accepted by the owner, 2026-10-12, by instruction: create and execute.** The instruction and the
evidence are recorded in [`next-wave-3-2026-10.md`](../../research/next-wave-3-2026-10.md).

---

## Requirements

- **R1 — Commander choices and hidden flags project.** `_optionSpecs()` copies `argChoices` to
  `choices` and `hidden` to `hidden`. A numeric or non-string default is still left out, as now.
- **R2 — Commander relations project.** `conflictsWith` becomes `exclusive`, using the camel-cased
  attribute names the manifest keys options by.
- **R3 — Commander arguments carry choices and defaults.** `Argument.argChoices` and a string
  `defaultValue` reach the positional's manifest entry.
- **R4 — Yargs relations and examples project.** `projectManifest` copies `.conflicts()` to
  `exclusive`, `.implies()` to `dependsOn`, and `.example()` pairs to the command's `examples`
  as `{ command, description }`.
- **R5 — Command aliases are a manifest field.** `CommandNode.aliases?: readonly string[]`.
  Native `defineCommand` accepts it. Dispatch resolves an alias to its command. `--schema` lists
  it on the command, help prints it the way commander's does (`serve|s`), completions offer it,
  and `--mcp` names the tool by the canonical path only.
- **R6 — Both façades project their aliases.** Commander's `.alias()` / `.aliases()` and yargs'
  array command names fill R5's field.

## Design

R1–R3 are one PR in `commander/command.ts`. R4 is one PR in `yargs/burgee.ts`. R5 is one PR in
`manifest.ts`, `execute.ts` (dispatch), `schema-surface.ts`, `help.ts` and `completions.ts`, and
lands before R6, which is a few lines in each façade.

Relations reuse `relations.ts`, which already validates `exclusive` and `dependsOn` before
choices. A façade already enforces its own conflicts while parsing. The projection is
declaration only, so a projected relation is never checked twice.

## Verification

| R | Check | Shown failing first by |
| :-- | :-- | :-- |
| R1 | `packages/burgee/src/facade-surface.test.ts`: `--schema` of an `Option.choices()` program has the enum; a hidden option is absent | today the schema has no `choices` key and lists the hidden flag |
| R2 | the same file: `.conflicts('b')` shows `exclusive: ['b']` | today no `exclusive` key |
| R3 | the same file: an `Argument` with `.choices()` and `.default()` | today the positional carries name and description only |
| R4 | `facade-surface.test.ts`, yargs block: conflicts, implies and an example | today none of the three appear |
| R5 | `packages/burgee/src/command-aliases.test.ts` (new): dispatch, schema, help, completions, MCP tool count | written first; `aliases` is an unknown key in `NODE_KEYS` and the definition check rejects it |
| R6 | the two façade surface tests: an aliased command is one schema entry with `aliases` | today the alias is absent from `--schema` |
| all | `npm run compat -- commander yargs` | the grade is the evidence the façades' own help did not move |

## Status

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | **Built** 2026-10-12 | `commander/command.ts` `_optionSpecs()`: `argChoices` → `choices`, `hidden` → `hidden: true` (as yargs already projects it: listed in `options` with the mark, absent from `inputSchema`, help and completions) | `facade-surface.test.ts` › `R1 — Option.choices() is the enum, in --schema and in the MCP tool` and `R1 — a hidden option is marked hidden…`. Red on main: `expected undefined to deeply equal [ 'fast', 'safe' ]`, `expected undefined to be true` |
| R2 | **Built** 2026-10-12 | the same function: a non-empty `conflictsWith` → `exclusive`, already the attribute names commander compares against | `facade-surface.test.ts` › `R2 — .conflicts() is exclusive, on the property and in relations`. Red on main: `expected undefined to deeply equal [ 'force' ]` |
| R3 | Not built | the default half is built in `_project()`: a string `Argument.defaultValue` reaches the positional's `default`. The choices half is open as [`B-20261012-commander-argument-choices`](../../gaps/B-20261012-commander-argument-choices.md): `ArgumentSpec` has no `choices`, and the smallest build measured `burgee/commander` at 61,132 B against its 61,100 B ceiling | `facade-surface.test.ts` › `R3 — an Argument carries its default`. Red on main: `expected { name: 'env', required: false, …(2) } to deeply equal { …(3) }` |
| R4 | Not built | stopped on `burgee/yargs`'s bundle ceiling: built and green locally on 2026-10-12, it measured 108,821 B against 108,420 B (main 108,249). The relations and examples halves each exceed the headroom alone, so it waits for the owner to trim or to raise the ceiling | `facade-surface.test.ts`, yargs block. Red on main: `expected undefined to deeply equal [ 'push' ]`, `… [ 'key' ]`, `expected [] to deeply equal [ {…}, … ]` |
| R5 | Not built | `parse-refusals` (#1064) merged on 2026-10-12, so the parse lane is clear for it | — |
| R6 | Not built | after R5 | — |

**Built: 2. Not built: 4.**

## Rejected alternatives

- **Re-parse the façade's rendered help to recover the data.** That is the help-scraping yargs
  #684's last comment describes as the state of the art, and the reason `--schema` exists.
- **List an alias as its own command in `--schema`.** An MCP client would get two tools for one
  action and an agent would pick between them for no reason.
- **Project commander's `.implies()` as `dependsOn`.** `implies` sets a value; `dependsOn`
  requires one. Projecting one as the other would put a false rule in the schema.

## Out of scope

- A numeric default on a commander option. The manifest's `default` is string or boolean, and
  widening it belongs to
  `commander-schema`.
- Commander's `.addHelpText()`. It is free text, not examples.
- Yargs' dotted option keys, skipped today by `optionSpecs` and rejected in wave 2.
