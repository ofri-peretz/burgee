# Design — positionals are typed, named and projected like options

Intent: [`intent.md`](./intent.md). **Status:** review.

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

No state machine; no model.

## Rejected alternatives

- **A per-argument `schema` (JSON Schema).** A second validation language; refused by
  D-20261012-typed-positionals-shape.
- **Replace `ctx.positionals`.** Breaks every 1.x handler for no gain.

## Out of scope

- yargs façade positionals, whose `choices` already reach `--schema` through its own path
  (`facade-projection-fidelity`).
