# Design — a native program names the command that runs when argv names none

Intent: [`intent.md`](./intent.md). **Status:** shipped 2026-10-25 in burgee 1.7.0 (Version PR #1231) — accepted 2026-10-20,
[`D-20261020-default-command-design-accepted`](../../decisions/D-20261020-default-command-design-accepted.md),
as re-grounded below on `main` at `ed14fd92c2`.

---

## Requirements

- **R1 — Declared and checked.** `Command.default?: boolean`, copied by `NODE_KEYS`; definition
  refuses two at one level with a `fix` naming both. *Check:*
  `packages/burgee/src/default-command.test.ts` (new); red on main,
  `TS2353: 'default' does not exist in type 'Command<…>'`. *Re-grounded:* the refusal is
  thrown by `defineProgram`'s tree walk (`addTree`), as `burgee: commands a and b of "demo" are
  both default; keep default: true on one`. See *Re-grounded 2026-10-20*.
- **R2 — Dispatch.** When argv resolves no command at a level with a default, the default runs
  with the remaining argv. A first word near a sibling's name is still the unknown-command
  refusal. A first word goes to the default as a positional only when the default declares
  one. *Check:* the same file: `demo`, `demo --port 1`, `demo serv` (refused, `did you mean
  serve`), `demo file.txt` against a default with one argument; red on main (root help, exit 2).
  *Re-grounded:* a first word is "near" a command under the same two rules the unknown-command
  refusal already applies. One is `suggestSimilar` over the level's children. The other is
  `meant`'s exact name one level deeper, so `demo add` is refused with `did you mean remote add?`.
- **R3 — Help.** Root help lists the default with `(default)` and prints its usage and examples
  under the root's (yargs #1331). *Check:* ~~`help.test.ts` case~~ `default-command.test.ts`; red on main.
  *Re-grounded:* "its usage" is read as the parts of its usage line. The usage line reads
  `[command]`, because a command is now optional. The default's arguments and options are listed
  in the level's `Arguments:` and `Options:` sections, because they are typed there, and
  `--explain` is listed because the level now runs. Its examples follow the level's, each once.
  This holds at every level that has a default, not only the root.
- **R4 — Projections.** `--schema` emits `default: true` on the command; root completions
  include the default's options; MCP is unchanged. *Check:* ~~`schema.test.ts` and
  `completions.test.ts` cases~~ `default-command.test.ts`; red on main. *Re-grounded:*
  `program-schema.json` gains `default`, and every level with a default offers the default's
  options, in the four scripts and in Fig.
- **R5 — Bytes.** Core and `./help` entries measured before and after; growth goes to a dated
  decision by the rule of D-20261012-mcp-current-budget. *Check:* `weight.test.ts`, B4.
  *Measured:* D-20261020-default-command-weight.

## Design

Resolution already walks argv to the deepest command it names (`surfaces.ts` when none). The
change is one branch where it stops: if the level has a default child, continue into it with the
rest of argv unchanged. The "near a sibling" test reuses the unknown-command distance already in
`surfaces.ts`. Help and schema read one key.

**Quint.** `needs_model` is `no?`: dispatch is a pure function of argv and the manifest, with no
awaits between its steps, so a table-driven test over argv shapes covers it. **Decided no** at
the design gate (re-grounded below). The only state is `execute`'s loop over `Again` lines. Each
line this change hands back names the default's path, which is one segment deeper than the level
that had no command. The tree is finite, so the loop ends after at most as many passes as the tree
is deep. The two other `Again` sources (globals typed first, JSON asked for first) fire only when
the line they hand back already resolves a runnable command, so none of the three can hand the
loop back to a shallower level. The termination cases are in the test: a default that is a group
with its own default, and one with none.

Order: R1–R2, then R3–R4, one lane in `execute.ts`.

## Verification

| R | Check | Red on main |
| :-- | :-- | :-- |
| R1, R2 | `default-command.test.ts` | no key; root help |
| R3 | `default-command.test.ts` (was `help.test.ts`) | no `(default)` |
| R4 | `default-command.test.ts` (was `schema.test.ts`, `completions.test.ts`) | no key, no options |
| R5 | `weight.test.ts`, B4 core ceiling | — |

## Rejected alternatives

- **A root `run` handler.** Cannot carry its own options and examples apart from globals, which
  is the complaint in yargs #1331 (D-20261012-default-command-shape).
- **yargs' `$0` / `*` names.** A magic string in a name field; the façade keeps it for yargs
  programs.
- **The default inside `Manifest.resolve`.** One branch at the end of the longest-prefix match
  would also answer `--help`, `--schema` drilling and `resolveCommand` (M6). `tool --help` would
  print the default's help instead of the root's, and `resolveCommand(manifest, [])`, which is
  public, would change its answer from `null`.
- **A bare word always to the default.** `demo buid` would run the default with `buid` as its
  argument, and the decision keeps a typo a refusal.
- **The duplicate check in `definition.ts`.** Every front-end loads that file and no façade
  declares `default`, so the refusal would cost the commander and yargs doors bytes they never use.

## Out of scope

- Default commands below the root's children beyond what R2 gives each level.
- The façades.
- `__complete` for a default's option typed at its parent, which is
  [`A-20261020-default-completer-at-parent`](../../gaps/A-20261020-default-completer-at-parent.md).
  `complete-dynamic.ts` belongs to the `completion-context` lane while that intent is in flight.

## Re-grounded 2026-10-20

Against `main` at `ed14fd92c2`, with completion-context (#1083's lane) still in flight beside it:

- **Where dispatch lives.** The design's branch is in `surfaces.ts`, as the design said:
  `unresolved`, the function `execute` loads when argv resolves no runnable command, throws an
  `Again` with the default's path and the caller's words. Nothing on the startup path changes but
  the `NODE_KEYS` entry. `--help`, `-h`, `--version` and `-V` are answered first, so they stay
  the level's own. `--schema`, `--mcp` and `--skill` are served before resolution, as before.
- **Where the refusal lives.** It is in `addTree`, in `execute.ts`, and not in `definition.ts`.
  The definition door is loaded by every front-end, and no façade declares `default`. A group
  built by `defineCommand` with two default children is therefore refused when `defineProgram`
  builds the tree, not when the group is declared.
- **"Near a command".** The unknown-command refusal reads two rules, and this uses both:
  `suggestSimilar` over the level's children, and `meant`'s exact name one level deeper.
- **Help.** The `(default)` mark and `[command]` are rendered by `help.ts`. The default's
  arguments, options and examples at its parent are composed in `surfaces.ts` (`withDefault`),
  next to the root's examples and exit codes, and the `./help` door does not carry them.
  `burgee/help`'s own `renderHelp` called on a level marks the default and does not list its
  options, the same way it does not list the root's exit codes.
- **One lookup.** `run-default.ts` (`defaultOf`) is the default of a level, and dispatch, help and
  completions all read it. A hidden default still runs, because hiding a command affects only
  where it is listed.
- **A default that is a group** is followed into its own default. If it has none, the line is the
  group's help with exit 2.
- **Checks.** R1–R4 are in one file, `default-command.test.ts`. Run against `main`'s sources,
  18 of its 29 cases fail and `tsc` reports the `TS2353` R1 names 14 times. The 11 that pass are
  the guards that must not move: a named command still runs itself, typos and an exact deeper
  name are still refused, a program with no default keeps `<command>` and root help, and `--mcp`
  is unchanged.
- **Projections.** `program-schema.json` publishes `default`. `--mcp` is unchanged, because a
  default command is already a tool.
- **Façades.** Unchanged: no façade node sets `default`, and both dispatch their own. The 11 B
  that publishing the key costs every front-end's `schema.js` are paid for there:
  `optionProperty` copies its four as-declared keys in one loop, and each front-end ends lighter
  than on `main` (D-20261020-default-command-weight).
