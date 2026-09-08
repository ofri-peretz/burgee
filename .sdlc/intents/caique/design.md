# Design — caique

Intent: [`intent.md`](./intent.md). **Status:** review.

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
  layer's E5 handler, which restores the terminal (raw mode off, cursor shown) first.
- **R5** Accessible mode: `kind: 'select'` renders as a numbered list with line input;
  no spinners.
- **R6** Under `--json`, prompting is impossible by definition: `--json` implies non-
  interactive, and a missing value is a `USAGE` error.

## Design

```
packages/caique/src/
  spec.ts        PromptSpec, binding to an option
  decide.ts      decide(value, runtime, flags) → 'skip' | 'prompt' | 'error'   (pure)
  widgets/       text, confirm, select, multiselect, password, path — over node:readline,
                 tokens from roundel, spinner from flagstaff, static projection per widget (U3)
  accessible.ts  numbered-list + line-input fallback, no redraw
  clack.ts       caique/clack  — clack's API over the widgets, graded by clack's suite
  inquirer.ts    caique/inquirer — same for inquirer
  burgee.ts      caique/burgee — the preAction binding for burgee, burgee/commander, burgee/yargs
```

`decide` is pure and shared, so the only host-specific code is where the hook sits and
how the value is written back.

## Verification

- `decide` unit suite for the full truth table (value source × TTY × CI × `--json` ×
  `--yes` × `--interactive`).
- PTY tests with `node-pty` in CI for prompt, cancel and SIGINT on all three OS runners.
- Conformance cases on both demos.

## What shipped (R1, R2, R3, R6 — the decision — 2026-09-08)

`spec.ts` and `decide.ts`, the two files that have to be right before anything draws.

`decide()` is pure — a value, a runtime slice and the run's flags in, a verdict out — so
the whole truth table is a unit test rather than a PTY, which is what the verification
section asked for. **All 256 combinations** of value × kind × TTY × CI × `--json` ×
`--yes` × `--interactive` × required are generated as a cartesian product and checked
against the rule *written a second time, independently*, so a table that agrees with the
implementation because the same hand wrote both would not pass.

Four cases are then named separately, because a generated table proves consistency and a
named case proves intent. The one that would be a bug report is called out in the suite by
that name: **no terminal and no value is never a prompt.** Proven red — making
`--interactive` able to reach past "nobody is there" turns twelve rows into hangs, and the
table says which twelve.

Two decisions the design did not settle, settled here:

- **`--interactive` with no terminal is an error that says so**, rather than a silent
  fall-through to the ordinary refusal. A flag that appears to do nothing is worse than one
  that refuses, and the message names the reason: `--interactive needs a terminal on stdin`.
- **`--yes` answers a `confirm` and nothing else.** It is not a licence to invent a path, a
  token or a selection, and the suite asserts that for all five other kinds.

`problemWith()` catches a spec that cannot be drawn — a `select` with no choices, a
`confirm` carrying choices, an empty message — when it is written rather than when someone
reaches that option. An empty `select` renders an empty list and waits, which is the same
hang one layer down.

Neither file imports roundel, flagstaff, burgee, a stream or `process`. `decide` returns an
E1 *code* and lets the caller build its own error type, so the binding is the only
host-specific part, exactly as the design says.

Not yet: the widgets, `accessible.ts`, the two façades (their runner now exists — the
oracle gained `vitest` on 2026-09-08), and the `burgee.ts` binding. The PTY tests come with
the widgets, since there is nothing to drive until then.

## Rejected alternatives

- ~~**Re-implementing prompts.** clack is good and maintained; the gap is the layer
  above it.~~ **Reversed 2026-09-08.** The family owns every layer (U6: zero external
  dependencies) and grades every incumbent by its own suite (U11). Wrapping clack would have
  made the one package that talks to a person the only one with a dependency it does not
  control, and clack has no static projection to give (U3). clack survives as `caique/clack`.
- **Wrapping clack** — same decision, recorded from the other side.
- **Prompting under `--json` and printing the answer.** An agent asked to type is an
  agent that hangs; `--json` means "no human here".
- **Auto-detecting agents by user agent or parent process.** Unreliable; TTY-ness plus
  `CI` is the honest signal, and `--interactive` is the explicit override.

## Out of scope

- Multi-step wizards with back navigation (clack #39) — v2 if asked.
- Theming beyond roundel's tokens (clack #36, #345 are answered by roundel, not here).
