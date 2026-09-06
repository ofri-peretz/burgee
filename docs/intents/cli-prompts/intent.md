# Intent — Prompts that are flags first, and errors when no one is there to answer

> Stage 1 artifact. Child of [`agent-native-cli-layer`](../agent-native-cli-layer/intent.md),
> requirements P1–P2; research §9 (clack). Packages `commander-prompts`, `yargs-prompts`.

**Status:** review · **Opened:** 2026-09-06 · **Owner:** @ofri-peretz

---

## What is wanted

Every interactive question a CLI asks is declared as an option first, so:

- a human without the flag gets a prompt (through `@clack/prompts`);
- a human with the flag is never asked (clack #167, `mytool --template this`);
- a non-TTY caller — CI, a pipe, an AI agent — gets a `USAGE` error naming the flag
  and never a hang (clack #533);
- `--interactive` (oclif/oclif #1492) asks for every missing required option in one
  pass; `--yes` accepts every confirmation; cancellation returns `CANCELLED` (E1) and
  `Ctrl+C` restores the terminal (clack #573, #408).

## Why now

- **clack #533 (2026-05) is the single clearest statement of the agent problem in any
  tracker**: "Interactive CLIs … break down in non-TTY environments like CI, and
  increasingly, AI coding agents. The CLI usually hangs forever and just fails."
- **The prompt libraries are converging on the same missing layer.** clack #22
  (hooks), #83 (cancellation API), #39 (go back), #379 (global settings), #345 (style
  representation), #585 (accessible mode: live redraws are re-announced by screen
  readers — and captured verbatim by agents).
- **P1 is also a lint rule** (`no-prompt-without-flag` in `eslint-plugin-cli-floor`); this
  package is the runtime that makes the rule satisfiable.

## Affected users and systems

- New `packages/commander-prompts` and `packages/yargs-prompts`, peer
  `@clack/prompts` (the one place the layer takes a UI dependency, and only in these
  two packages).
- `@interlace/cli-core/src/prompts/`: the flag↔prompt binding model, host-neutral.
- `commander-schema` gains `prompt: { message, kind }` on an option spec.

## Constraints

1. A prompt cannot exist without an option; the API takes the option name, never a
   bare question.
2. In non-TTY the package never calls clack at all; the error is produced by the layer
   with `fix: { flag: '--name <value>' }`.
3. Accessible mode (clack #585): when `runtime.env.CLI_ACCESSIBLE` or a screen-reader
   hint is set, prompts fall back to line input with no live redraw.
4. clack's API is wrapped, not re-exported; a clack major bump is absorbed here.

## Success criteria

- Conformance cases: flag given → no prompt; TTY without flag → prompt; non-TTY without
  flag → `USAGE` with `fix`; `--yes`; `--interactive`; cancel → `CANCELLED`.
- The benchmark's non-TTY task (intent 5) never times out on the layered demo.
- `Ctrl+C` during a prompt leaves `stdin` out of raw mode on macOS, Linux and Windows
  (clack #408), tested with a PTY in CI.

## Open questions

None open. Decided at finalisation (2026-09-06):

- **Floor addition P3 is adopted.**
- **"Go back a step" is out of scope for v1**; groups are linear.
- **`--interactive` prompts for missing required options only; `--interactive=all`
  also prompts optional ones that declare a `prompt`.**
