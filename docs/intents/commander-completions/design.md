# Design — Completions

Intent: [`intent.md`](./intent.md). **Status:** draft.

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
