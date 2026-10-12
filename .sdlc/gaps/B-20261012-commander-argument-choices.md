---
id: B-20261012-commander-argument-choices
section: B
status: open
source: facade-projection-fidelity R3
recommendation: 'land it with wave 4''s typed positionals, which adds `choices` to `ArgumentSpec` and its `enum` to the input schema for every front-end at once; until then the façade publishes an argument''s default and not its choices'
---

Commander's `new Argument('[env]').choices(['staging', 'prod'])` is enforced by the façade while
parsing and reaches no projected surface: `--schema`, `--mcp`'s `inputSchema` and completions see
`env` as any string. R3's default half is built (a string `defaultValue` reaches the positional's
`default`); the choices half is not, for two reasons measured on 2026-10-12:

- **The manifest has no field for it.** `ArgumentSpec` carries `name`, `description`, `required`,
  `variadic`, `default` and `type`, and no `choices`. The intent reuses the manifest's vocabulary
  and does not widen it, and adding the field is public API for every front-end, not a façade
  edit.
- **It does not fit `./commander`'s budget.** Built as the smallest version (the `ArgumentSpec`
  field, `argumentProperty` publishing `enum`, the façade copying `argChoices`), `burgee/commander`
  bundled 61,132 B against its 61,100 B ceiling (`benchmarks/axes/weight.ts`), before CI's
  usual +32 B. R1–R3's other halves had already taken it from 60,905 to 61,046.

Wave 4's typed positionals (`next-wave-3-2026-10.md`, rejected list: `type`, `choices`, `schema`
on `ArgumentSpec`) adds the same field for native programs; the façade's copy is then one line.
