# Design — a native program names the command that runs when argv names none

Intent: [`intent.md`](./intent.md). **Status:** review.

---

## Requirements

- **R1 — Declared and checked.** `Command.default?: boolean`, copied by `NODE_KEYS`; definition
  refuses two at one level with a `fix` naming both. *Check:*
  `packages/burgee/src/default-command.test.ts` (new); red on main,
  `TS2353: 'default' does not exist in type 'Command<…>'`.
- **R2 — Dispatch.** When argv resolves no command at a level with a default, the default runs
  with the remaining argv. A first word near a sibling's name is still the unknown-command
  refusal. A first word goes to the default as a positional only when the default declares
  one. *Check:* the same file: `demo`, `demo --port 1`, `demo serv` (refused, `did you mean
  serve`), `demo file.txt` against a default with one argument; red on main (root help, exit 2).
- **R3 — Help.** Root help lists the default with `(default)` and prints its usage and examples
  under the root's (yargs #1331). *Check:* `help.test.ts` case; red on main.
- **R4 — Projections.** `--schema` emits `default: true` on the command; root completions
  include the default's options; MCP is unchanged. *Check:* `schema.test.ts` and
  `completions.test.ts` cases; red on main.
- **R5 — Bytes.** Core and `./help` entries measured before and after; growth goes to a dated
  decision by the rule of D-20261012-mcp-current-budget. *Check:* `weight.test.ts`, B4.

## Design

Resolution already walks argv to the deepest command it names (`surfaces.ts` when none). The
change is one branch where it stops: if the level has a default child, continue into it with the
rest of argv unchanged. The "near a sibling" test reuses the unknown-command distance already in
`surfaces.ts`. Help and schema read one key.

**Quint.** `needs_model` is `no?`: dispatch is a pure function of argv and the manifest, with no
awaits between its steps, so a table-driven test over argv shapes covers it.

Order: R1–R2, then R3–R4, one lane in `execute.ts`.

## Verification

| R | Check | Red on main |
| :-- | :-- | :-- |
| R1, R2 | `default-command.test.ts` | no key; root help |
| R3 | `help.test.ts` | no `(default)` |
| R4 | `schema.test.ts`, `completions.test.ts` | no key, no options |
| R5 | `weight.test.ts`, B4 core ceiling | — |

## Rejected alternatives

- **A root `run` handler.** Cannot carry its own options and examples apart from globals, which
  is the complaint in yargs #1331 (D-20261012-default-command-shape).
- **yargs' `$0` / `*` names.** A magic string in a name field; the façade keeps it for yargs
  programs.

## Out of scope

- Default commands below the root's children beyond what R2 gives each level.
- The façades.
