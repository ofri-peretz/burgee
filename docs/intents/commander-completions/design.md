# Design — Completions

Intent: [`intent.md`](./intent.md). **Status:** review.

---

## Requirements

- **R1** `renderCompletion(node, shell)` in `@interlace/cli-core`: `bash` (complete -F
  with a case tree), `zsh` (`_arguments` with descriptions), `fish` (`complete -c` per
  command/option with `-d`), `pwsh` (`Register-ArgumentCompleter` with tooltips,
  yargs #1210).
- **R2** Options with `choices` complete their values; `flag` options do not; `--no-x`
  offered for every negatable boolean; hidden commands excluded.
- **R3** `--dynamic` marks an option whose values come from `mytool __complete OPTION PARTIAL`, a hidden command the agent layer installs; only those options
  shell out.
- **R4** `renderFigSpec(node)` → JSON matching Fig's `Fig.Spec`.
- **R5** `withCompletions(program)` adds `completion <shell>` and `__complete`.

## Design

Templates per shell live as tagged-template functions over `HelpSections`-like data,
not string concatenation of manifest JSON; each has a snapshot at `examples/`.

CI matrix job `completions` runs each shell non-interactively: bash via
`COMP_WORDS`/`COMP_CWORD` and calling the function; zsh via `compdef` in a
`zsh -f` session with `zpty`; fish via `complete -C 'mytool con'`; pwsh via
`TabExpansion2`. Assertions are on the returned candidate lists.

## Status (2026-09-08)

| Req | State | Where |
| :-- | :-- | :-- |
| R1 | `renderCompletion(manifest, shell)` for bash (`complete -F` with a path walk), zsh (`_arguments` per level, `_values` for subcommands), fish (`complete -c` with `__fish_seen_subcommand_from` chains), pwsh (`Register-ArgumentCompleter -Native` with a path table and tooltips) | `packages/burgee/src/completions.ts` |
| R2 | choices complete their values; booleans take none; hidden commands and options excluded. `--no-x`: the native manifest has no negation yet, so nothing to offer — lands with commander-schema's `flag` type | `completions.test.ts` |
| R3 | `--dynamic` — not yet; every script is fully static today (D3 holds absolutely) | — |
| R4 | `renderFigSpec(manifest)` from the same walk | "exports a Fig spec" |
| R5 | `completion <shell>` and `completion fig` synthesised for every program unless it defines its own `completion`; also on commander-syntax programs | "is served as `completion <shell>`", `adoption-ladder.test.ts` |
| D3 | no script contains a call to the program; TAB never runs a handler (sentinel test) | "never invokes the program" |
| D4 | snapshots per shell; each shell drives its script: bash via COMP_WORDS, zsh via a real TAB in a pseudo-terminal (`scripts/complete-zsh.zsh`), fish via `complete -C`, pwsh via TabExpansion2 — `completions.yml` runs all four on ubuntu-latest | `scripts/complete-*.{sh,zsh,fish,ps1}` |
| Fig schema validation | not yet — the spec is generated; validating it against Fig's published schema needs that schema vendored | — |

The four scripts live in burgee's core (one entry, no `commander-completions` package): the
manifest is host-neutral and the templates are ~250 lines.

## Verification

- Snapshot suite for four shells on the demo manifest.
- Shell-driven completion tests in CI (R1–R3).
- Fig spec validated with Fig's published JSON schema.

## Rejected alternatives

- **Dynamic completions calling Node on every TAB** (yargs' model). Slow, and the source
  of five of the open bugs.
- **Tabtab / omelette.** Both generate from a runtime callback, not from data, and add
  dependencies.

## Out of scope

- Editing users' shell rc files.
- Nushell, elvish — after four shells are green.
