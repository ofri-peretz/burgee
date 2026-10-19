# Intent — What a commander or yargs program already declares reaches every surface

> Stage 1 artifact. Opened from the wave-3 ranking
> ([`next-wave-3-2026-10.md`](../../research/next-wave-3-2026-10.md)). The drop-ins collect
> choices, conflicts, hidden flags and command aliases at parse time and then drop them before
> `--schema`, `--mcp`, completions and help see the manifest.

**Status:** shipped · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz · **Shipped:** 2026-10-19 by `fix/facade-fidelity-and-weight`, verified against `main` at `6b90ffe` plus that branch — R1–R6 each locked by `facade-surface.test.ts` or `command-aliases.test.ts` (the evidence table is `spec.md` § Status), and criterion 4 by `npm run compat -- commander yargs`, 1360 / 1360 and 816 / 816

---

## What is wanted

A program moved to `burgee/commander` or `burgee/yargs` gets every declaration it already makes
on the projected surfaces, with no edits:

- an option's choices become `enum` in `--schema` and in the MCP tool's `inputSchema`, and the
  values that completions offer;
- commander's `.conflicts()` and yargs' `.conflicts()` / `.implies()` become relations in
  `--schema` (`exclusive` / `dependsOn`, the manifest's own vocabulary);
- a hidden commander option stays out of `--schema` and help, as it already does in yargs;
- argument choices and defaults reach the positional's entry;
- command aliases (`.alias()`, `.aliases()`, yargs' `command: ['serve', 's']`) are listed and
  resolved on every surface;
- yargs' `.example()` reaches the command's `examples`.

## Why now

- **The data is already collected and discarded.** `_optionSpecs()` in
  `packages/burgee/src/commander/command.ts` (line 1739) copies type, description, mandatory,
  short, default, env and negatable, and nothing else. `argChoices`, `conflictsWith`, `hidden`
  and argument choices exist on commander's `Option` and `Argument`, and the façade keeps them
  for parsing. `projectManifest` in `packages/burgee/src/yargs/burgee.ts` (line 100) projects
  choices, hidden and deprecated, and drops relations, examples and command aliases.
- **The manifest already has every field.** `OptionSpec` carries `choices`, `dependsOn` and
  `exclusive` (`packages/burgee/src/manifest.ts` lines 48, 63, 71), and `CommandNode` carries
  `examples` (line 305). A native program gets them projected today. A drop-in program does not.
- **Demand.** Valid values as data are the first gap an MCP tool definition hits: cobra #2362,
  quoted in `.sdlc/research/agent-requirements.md` §4, lists `enum` as "not readable as data" in
  a typical framework. The five large commander CLIs measured in
  `.sdlc/research/commander-api-usage.md` call `.alias()` at 9 sites, `.aliases()` at 5 and
  `.addOption()` (the way choices are declared) at 7. clispec 0.3 builds its output probe from a
  command's `example`, so a yargs program's own examples are lost points
  (`next-wave-2026-10.md`, "The output checks probe from the schema's own examples").
- **It is the migration promise.** The drop-in is sold as "the surfaces for free". A surface
  that is less true than the help text of the same program is a regression an agent sees first.

## Affected users and systems

- `packages/burgee/src/commander/command.ts`, `packages/burgee/src/yargs/burgee.ts`, and
  `manifest.ts` for command aliases.
- Every façade program's `--schema`, `--mcp`, completions, `--skill` (wave 2's `agent-skill`).
- The graded suites: commander 1,360 / 1,360 and yargs 816 / 816 must not move.

## Constraints

- **No graded behaviour moves.** Help printed by the façades is the incumbent's, byte for byte.
  This changes projected surfaces, not the façade's own help.
- **The manifest vocabulary is reused, not widened**, except for command aliases, which have no
  field today.
- **The core byte budget holds.** The projection runs only when a surface is asked for, as it
  does now.

## Success criteria

1. A commander program with `.addOption(new Option('--mode <m>').choices(['a', 'b']))` shows
   `enum: ["a", "b"]` in `--schema` and in `--mcp`'s `tools/list`.
2. `.conflicts()` on either façade shows in `--schema` as `exclusive`; yargs `.implies()` as
   `dependsOn`.
3. Command aliases dispatch and are listed on every surface, native and façade.
4. `npm run compat -- commander yargs` is unchanged in the same PRs.

## Open questions

- How a command alias appears in `--schema`. **Answered 2026-10-12 in `spec.md`**: as an
  `aliases` array on the command, never as a second command, so a tool list does not double.
- Whether commander's `.implies()` (which sets values) maps to `dependsOn`. **Answered
  2026-10-12 in `spec.md`**: no. It is not a requirement relation, so it is projected as the
  option's `description` suffix only when the façade's help already prints it, and otherwise
  not at all.
