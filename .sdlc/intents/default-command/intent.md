# Intent — a native program names the command that runs when argv names none

> Stage 1 artifact. Opened from the wave-4 ranking
> ([`next-wave-4-2026-10.md`](../../research/next-wave-4-2026-10.md)). Wave 3 left it at the cut,
> tied at 7.5, and named it first in line for wave 4.

**Status:** review · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

---

## What is wanted

A native multi-command program (`defineProgram`) marks one command `default: true`. `tool` with no
command, or `tool --port 8080` with only that command's options, runs it. Its help, examples and
output declaration show under `tool --help` as the default, and `--schema`, completions and
`--mcp` all say which command is the default.

## Why now

- **Demand.** yargs #1331, *"Examples and usage not showing when using default command"*: 4
  reactions, 16 comments; yargs #2292: 5 reactions, 6 comments (both in the 2026-09-05 dump,
  `.sdlc/research/issues/yargs_yargs.json`; #1331's 16 comments re-read 2026-10-12 for wave 3).
- **Parity gap on the native API.** commander has `isDefault`, yargs `$0` / `*`; the façades
  serve both, graded. The API recommended for new programs has nothing: `tool` alone is today a
  root help or a refusal, and the workaround is a named command the user must type.
- **The shape is decided.** D-20261012-default-command-shape.

## Affected users and systems

- `packages/burgee/src/execute.ts` (dispatch), `definition.ts` (the check), `help.ts`,
  `schema.ts`, `completions.ts`, `mcp.ts` (no change expected: a command is already a tool).
- Every native multi-command program.

## Constraints

- **One lane in `execute.ts`'s parse and dispatch at a time** (wave 3's rule), after
  `completion-context` and `facade-projection-fidelity` R5–R6 (#1083, aliases).
- **A typo is still refused.** A word that is near a command name keeps its `did you mean`.
- **Façades untouched.** Their default commands are the incumbents' and graded.

## Success criteria

1. `demo` with no command runs the default and exits as it does; `demo --help` lists it with
   `(default)` and shows its examples.
2. Two `default: true` siblings fail definition with a `fix`.
3. `--schema` carries `default: true`; root completions offer the default's options.

## Jev triage

| user_impact | incumbent_gap | risk_reduced | composite | ready_for_spec | needs_model |
| --: | --: | --: | --: | :-- | :-- |
| 2 | 2 | 1 | 12 | yes | no? |

## Open questions

- How it is declared. **Decided 2026-10-12**, D-20261012-default-command-shape.
- Whether a bare word goes to the default. **Decided 2026-10-12** in the same decision: only when
  the default declares positionals and the word is not near a command name.
