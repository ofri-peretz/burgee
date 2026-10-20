# Design — positionals are typed, named and projected like options

Intent: [`intent.md`](./intent.md). **Status:** approved.

---

## Requirements

- **R1 — The declaration.** `ArgumentSpec.type` widens to `'string' | 'number' | 'integer' |
  'boolean' | 'file'`; `choices?: readonly string[]`. The definition check accepts them and
  refuses `choices` on a non-string type. *Check:* `packages/burgee/src/typed-positionals.test.ts`
  (new); red on main, `TS2322` on `type: 'integer'`.
- **R2 — `ctx.args`.** `RunContext.args` keyed by argument name, a variadic one as an array,
  typed through the program's inference like `options`. *Check:* the same file, plus a `tsd`-style
  `expectTypeOf(ctx.args.n).toEqualTypeOf<number>()`; red on main.
- **R3 — Refusal.** A value failing type or choices throws the usage error an option gets, with
  the catalog message and a `fix` naming the valid values (the line with the closest choice).
  *Check:* `typed-positionals.test.ts` and `json-failure.test.ts` (the `fix` runs, exit 0); red
  on main (exit 0, value passed through).
- **R4 — Projections.** `argumentProperty` emits `type` and `enum`; completions offer choices for
  a positional; `--mcp` `inputSchema` carries both. *Check:* `schema.test.ts`, `completions.test.ts`,
  `mcp.test.ts` cases; red on main.
- **R5 — commander's `choices()`.** The façade copies `argChoices` into `choices`. *Check:*
  `commander/facade-schema.test.ts` (new) case for `new Argument('[env]').choices([...])`; red on main;
  `npm run compat -- commander` unchanged.
- **R6 — The gap closes.** `B-20261012-commander-argument-choices` `status: closed`.

## Design

Arguments get the coercion options already get: one shared function from declared type to
value, called where positionals are assigned. `args` is built from the same split
(`splitPositionals`). Projection reads the manifest, so R4 is the native and façade halves at
once and R5 is one line in the façade.

Order: R1–R3 (one PR in the parse lane), R4, then R5–R6 with the `./commander` budget measured.

## Verification

| R | Check | Red on main |
| :-- | :-- | :-- |
| R1–R3 | `typed-positionals.test.ts`, `json-failure.test.ts` | type error; exit 0 |
| R4 | `schema.test.ts`, `completions.test.ts`, `mcp.test.ts` | no `enum` |
| R5 | `commander/facade-schema.test.ts`; `npm run compat -- commander` | no `enum` |
| R6 | `gaps-lock.test.ts` | gap open |

No state machine; no model. Assignment is positional and one pass: each declared argument takes one word, a variadic last one the rest, an absent optional one its `default` — no ordering rule with more than one reachable state to check.

## Status (2026-10-19)

| R | State | Where |
| :-- | :-- | :-- |
| R1 | built. The declaration check runs in `typed-args.ts` on the command's first run, before any word is read, and in TypeScript (`DeclaredArgument`) where it is written, not in `definition.ts`: there it cost 382 B in every front-end and broke two claim ratchets (D-20261019-typed-schema-surface-weight) | `typed-positionals.test.ts` › "R1 — the declaration" |
| R2 | built: `RunContext.args`, `InferArgs` | `typed-positionals.test.ts` › "R2 — ctx.args, typed and by name" (with `expectTypeOf`) |
| R3 | built: `typed-args.ts`; the `fix` swaps one word (`swap` in `failure.ts`) | `typed-positionals.test.ts` › "R3 — a value that fails its type or choices is a usage error" |
| R4 | `enum` held for native programs, read from the manifest. **Remaining:** the argument's `type` on its `inputSchema` property (78 B in `schema.js`, which every front-end reaches, against `./commander` and `./yargs` ceilings with 12 and 31 B to spare), and completions | `typed-positionals.test.ts` › "R4 — the projections carry the choices" |
| R5, R6 | held since #1091 | `facade-surface.test.ts` › "R3 — an Argument's .choices() is the enum, in --schema and in the MCP tool" |

## Rejected alternatives

- **A per-argument `schema` (JSON Schema).** A second validation language; refused by
  D-20261012-typed-positionals-shape.
- **Replace `ctx.positionals`.** Breaks every 1.x handler for no gain.

## Out of scope

- yargs façade positionals, whose `choices` already reach `--schema` through its own path
  (`facade-projection-fidelity`).
