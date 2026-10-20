# Intent — a native program names the command that runs when argv names none

> Stage 1 artifact. Opened from the wave-4 ranking
> ([`next-wave-4-2026-10.md`](../../research/next-wave-4-2026-10.md)). Wave 3 left it at the cut,
> tied at 7.5, and named it first in line for wave 4.

**Status:** approved (2026-10-20, under the owner's delegation, [`D-20261020-default-command-design-accepted`](../../decisions/D-20261020-default-command-design-accepted.md)) — built 2026-10-20, every criterion evidenced below; it moves to `shipped` when the burgee minor that carries it publishes · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz · **Design:** [`spec.md`](./spec.md)

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
- Whether it is worth its bytes, and whether it needs a model. **Decided 2026-10-20**,
  D-20261020-default-command-design-accepted: built, at the cost recorded in
  D-20261020-default-command-weight, and with no Quint model (spec.md, *Design*).

## Status — 2026-10-20

Built on `feat/default-command` against `main` at `ed14fd92c2`. The constraints hold. Dispatch
lives in `surfaces.ts`, so this lane does not touch `execute.ts`'s parse and dispatch. A typo is
still refused. The façades are untouched: `npm run compat -- commander yargs extra-typings` reads
commander **1,360 / 1,360**, yargs **816 / 816** and extra-typings **369 / 369**, all ▲ 0 against
their baselines. cac has no graded suite yet, and only its weight is compared.

`default-command.test.ts` holds R1–R4. Run against `main`'s sources, **18 of its 29 cases fail**
and `tsc` reports `TS2353` (`'default' does not exist in type 'Command<…>'`) 14 times. The 11 that
pass on `main` are the guards that must not move. `scripts/mutation.ts changed` on the changed
lines: **118 killed and 1 timeout of 119 mutants, 0 survivors**, in 3.1 minutes. No Quint model:
dispatch is a pure function, and the spec gives the argument that the `Again` loop terminates.

| Criterion | Evidence |
| :-- | :-- |
| 1. `demo` with no command runs the default and exits as it does; `demo --help` lists it with `(default)` and shows its examples | **Met.** `demo`, `demo --port 8080`, `demo public` and `demo --json` run the default, and so does `demo --quiet`, a global typed first. A default that calls `exit(3)` leaves 3. `demo remote` runs `remote`'s default. `demo --help` stays the root's help, reads `Usage: demo [command] [options]`, marks `serve [dir]  serve the site (default)`, lists `--port` and `[dir]`, and prints the root's examples and then the default's, each once (yargs #1331). `demo buid`, `demo serv` and `demo add` are refused with their `did you mean`, and so is a tie between two commands. |
| 2. Two `default: true` siblings fail definition with a `fix` | **Met.** `defineProgram` throws `burgee: commands a and b of "demo" are both default; keep default: true on one`, and names the group below the root (`"demo remote"`). One default at each level, or a `default: false` beside one, is accepted. |
| 3. `--schema` carries `default: true`; root completions offer the default's options | **Met.** `--schema` has `default: true` on `serve` and on `remote list` and no key elsewhere, and `program-schema.json` declares it. `completionTree` offers `port` at the root and `verbose` at `remote`, and so does the Fig spec. `toolsOf` lists `serve` and `remote_list` once each, as before. `__complete` for a default's own completer at its parent is gap A-20261020-default-completer-at-parent, held for the `completion-context` lane. |

Weight (D-20261020-default-command-weight): `.` 35,822 → 36,069 B dist (ceiling 35,850 → 36,100);
`./help` 9,228 → 9,602 (ceiling 9,250 → 9,650). Bundled `burgee` 24,431 → 24,441 under its
24,500 ceiling, and `burgee ÷ cac` 2.338 under the 2.35 ratchet, which is unchanged. Every
façade entry is lighter than on `main` (−95 B dist, −58 B bundled), because `--schema`'s option
copy became one loop, and the four over-incumbent ratchets are lowered to match.
