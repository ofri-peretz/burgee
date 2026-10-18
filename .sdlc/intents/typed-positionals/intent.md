# Intent — positionals are typed, named and projected like options

> Stage 1 artifact. Opened from the wave-4 ranking
> ([`next-wave-4-2026-10.md`](../../research/next-wave-4-2026-10.md)). Wave 3 rejected it on cost
> and named it for wave 4, after `facade-projection-fidelity`, which it builds on; that intent's
> R3 then opened gap `B-20261012-commander-argument-choices` for exactly this.

**Status:** review · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

---

## What is wanted

`ArgumentSpec` takes `type` (`string`, `number`, `integer`, `boolean`, `file`) and `choices`. A
handler reads `ctx.args.env`, typed from the declaration, beside `ctx.positionals`. A value that
fails its type or choices is a usage error with a `fix`, as an option's is. `--schema`, `--mcp`'s
`inputSchema` and completions carry the type and the `enum`, for native programs and for
`burgee/commander`'s `Argument.choices()`.

## Why now

- **Demand.** yargs #1649, a typed required positional: 10 reactions, 7 comments; citty #115
  (5 reactions), #138 (`number` args, 3 reactions, 3 comments), #80 (2, 2) — counted from the
  2026-09-05 dumps. `commander-schema`'s typed-positionals criterion is unmet (wave 3's rejected
  list).
- **An open gap.** `B-20261012-commander-argument-choices`: commander's
  `new Argument('[env]').choices([...])` is enforced while parsing and reaches no projected
  surface, so an agent's tool definition says `env` is any string.
- **The shape is decided.** D-20261012-typed-positionals-shape.

## Affected users and systems

- `manifest.ts` (`ArgumentSpec`, `RunContext`), `execute.ts` (coercion), `validate.ts`,
  `schema.ts` (`argumentProperty`), `completions.ts`, `mcp.ts`, `commander/` (copy
  `argChoices`), and the types a native program infers.
- Every native program with positionals; every `burgee/commander` program using
  `Argument.choices()`.

## Constraints

- **`ctx.positionals` is unchanged.** `args` is additive.
- **One lane in `execute.ts` at a time**, after `default-command`, `completion-context` and
  `facade-projection-fidelity`.
- **Budgets by rule.** `./commander` is at its ceiling (the gap: 61,132 against 61,100 for the
  smallest version); any raise is the measurement rounded up to 50 B in a dated decision.

## Success criteria

1. `defineCommand({ args: [{ name: 'n', type: 'integer' }] })` gives `ctx.args.n` a `number`
   type and value; `x` is exit 2 with a `fix`.
2. `choices` reach `--schema` (`enum`), `--mcp` `inputSchema` and completions, native and
   commander façade.
3. The gap is closed.

## Jev triage

| user_impact | incumbent_gap | risk_reduced | composite | ready_for_spec | needs_model |
| --: | --: | --: | --: | :-- | :-- |
| 3? | 2 | 2? | 17 | yes | no |

## Open questions

- The key set and whether a per-argument JSON Schema is allowed. **Decided 2026-10-12**,
  D-20261012-typed-positionals-shape: no `schema` key.
