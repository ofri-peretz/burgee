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
| R3 | **Built** 2026-10-13 | the default half in `_project()` (2026-10-12): a string `Argument.defaultValue` reaches the positional's `default`. The choices half, after the diet freed room ([`B-20261012-commander-argument-choices`](../../gaps/B-20261012-commander-argument-choices.md), closed): `ArgumentSpec.choices`, copied by the `declared()` helper `_optionSpecs()` also calls, and published as `enum` by `schema.ts`'s `withChoices()`, the options' path. `burgee/commander` 55,353 → 55,343 B, with nothing raised ([`D-20261013-commander-argument-choices-budget`](../../decisions/D-20261013-commander-argument-choices-budget.md)) | `facade-surface.test.ts` › `R3 — an Argument carries its default`, `R3 — an Argument's .choices() is the enum, in --schema and in the MCP tool` and `R3 — a variadic Argument puts its choices on the items…`. Red on main: `expected { name: 'env', required: false, …(2) } to deeply equal { …(3) }`; then `expected { name: 'x', required: true, …(1) } to deeply equal { name: 'x', required: true, …(2) }` and `expected { type: 'array', …(1) } to deeply equal { type: 'array', items: { …(2) } }` |
| R4 | **Built** 2026-10-19 | `yargs/burgee.ts` `optionSpecs()`: what a key (or one of its aliases) names in `.conflicts()` becomes `exclusive` and in `.implies()` becomes `dependsOn`, each target resolved through the aliases to its canonical key and kept only where it names an option projected here (a positional count, a `--no-x` negation and a dotted key are left out). `projectManifest()` copies `.example()` pairs to `examples` as `{ command, description }`, with `$0` spelt as the program and an empty description left out. The snapshot (`yargs/factory.ts`) carries validation's `getConflicting()` / `getImplied()` and usage's new `getExamples()`. Bytes: `burgee/yargs` 108,345 → 108,773 B bundled and the `./yargs` walk 220,765 → 221,623 B; both ceilings raised to the measurement plus CI's margin by [`D-20261019-yargs-facade-relations-bytes`](../../decisions/D-20261019-yargs-facade-relations-bytes.md), after trimming found nothing that kept the fix whole. Still 0.974× yargs. `npm run compat -- commander yargs`: 1360 / 1360 and 816 / 816, unchanged | `facade-surface.test.ts` › `facade-projection-fidelity R4`, four cases. Red on main: `expected undefined to deeply equal [ 'dryRun' ]`, `expected undefined to deeply equal [ 'key' ]`, `expected undefined to deeply equal [ 'verbose' ]`, `expected [] to deeply equal [ Array(2) ]` |
| R5 | **Built** 2026-10-12 | `CommandNode.aliases` and `Command.aliases` (`manifest.ts`, `execute.ts`). Dispatch is `aliases.ts`, a chunk `execute.ts` loads only for a program that declares an alias: it rewrites each alias typed where a subcommand could stand to that command's name before anything resolves argv, so `help <command>`, `--schema <command>` and `__complete` read it too. It is not in `Manifest.resolve`, as the design had it, because the commander and yargs front-ends carry that class and resolve their own aliases: there it cost each front-end 66 B. `--schema` passes `aliases` through (`schema.ts`, `program-schema.json`), help lists `serve\|s` (`help.ts`), and the four scripts and Fig offer and follow an alias (`completions.ts`). `--mcp` was already one tool per command | `command-aliases.test.ts`, 18 checks. Red on main: 13 of the first 17 failed, e.g. `expected { code: 2, stdout: '', …(1) } to deeply equal { code: +0, …(2) }` (`web s` was an unknown command) and `expected undefined to deeply equal [ 's', 'up' ]` (no `aliases` in `--schema`); the MCP tool count, an unknown word, and the two no-alias guards passed on main as guards |
| R6 | **Built** 2026-10-12 | commander's `_project()` copies `_aliases`; yargs' handler keeps the aliases it was registered with and `projectManifest` copies them | `facade-surface.test.ts` › `facade-projection-fidelity R6`. Red on main: both failed with `expected undefined to deeply equal [ 's', 'up' ]` |

Bytes (local `esbuild` measure, the same command as B4, against `main` at `91a67e9`, after #1078): the
core bundle 24,285 → 24,281 B, `burgee/commander` 56,116 → 56,110 B, `burgee/yargs` 108,314 → 108,342 B. No
ceiling moved: the alias gate and `NODE_KEYS` entry were paid for by shorter tests of the same
values in `execute.ts`, and commander's projection by three in `commander/command.ts`.

**Built: 6. Not built: 0.**

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
