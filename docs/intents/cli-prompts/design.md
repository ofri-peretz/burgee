# Design — Prompts

Intent: [`intent.md`](./intent.md). **Status:** draft.

---

## Requirements

- **R1** `PromptSpec = { kind: 'text' | 'confirm' | 'select' | 'multiselect' |
  'password' | 'path'; message: string; initial?; validate? }` attached to an option
  (schema `prompt:` or `promptFor(cmd, 'option', spec)`).
- **R2** Resolution in `preAction` after `commander-env`: if the option has a value
  from any source → no prompt; else if `runtime.isTTY.stdin && !runtime.env.CI` →
  prompt; else → `CliError` `USAGE` with `fix.flag`.
- **R3** `--yes` answers every `confirm` true; `--interactive[=all]` prompts for every
  missing required (or every promptable) option in declaration order.
- **R4** Cancel (`isCancel`) → `CliError` `CANCELLED`; SIGINT during a prompt runs the
  layer's E5 handler, which calls clack's cleanup first.
- **R5** Accessible mode: `kind: 'select'` renders as a numbered list with line input;
  no spinners.
- **R6** Under `--json`, prompting is impossible by definition: `--json` implies non-
  interactive, and a missing value is a `USAGE` error.

## Design

```
packages/cli-core/src/prompts/
  spec.ts        PromptSpec, binding to OptionSpec
  decide.ts      decide(value, runtime, flags) → 'skip' | 'prompt' | 'error'   (pure)
packages/commander-prompts/src/
  index.ts       withPrompts(program) — preAction; clack adapter; accessible fallback
packages/yargs-prompts/src/
  index.ts       same via after-validation middleware
```

`decide` is pure and shared, so the only host-specific code is where the hook sits and
how the value is written back.

## Verification

- `decide` unit suite for the full truth table (value source × TTY × CI × `--json` ×
  `--yes` × `--interactive`).
- PTY tests with `node-pty` in CI for prompt, cancel and SIGINT on all three OS runners.
- Conformance cases on both demos.

## Rejected alternatives

- **Re-implementing prompts.** clack is good and maintained; the gap is the layer
  above it, exactly as with commander.
- **Prompting under `--json` and printing the answer.** An agent asked to type is an
  agent that hangs; `--json` means "no human here".
- **Auto-detecting agents by user agent or parent process.** Unreliable; TTY-ness plus
  `CI` is the honest signal, and `--interactive` is the explicit override.

## Out of scope

- Multi-step wizards with back navigation (clack #39) — v2 if asked.
- Theming beyond clack's own settings (clack #36, #345).
