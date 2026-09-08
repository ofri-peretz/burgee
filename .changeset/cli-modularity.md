---
"burgee": minor
---

Large CLIs (M1–M6): `load: () => import('./x.js')` on a command loads its handler on dispatch only — help, `--schema` (which marks it `lazy`), completions and the MCP tool list are complete without it; `sharedOptions(name, specs)` declares a set once and each copy is tagged `sharedFrom` in the schema; a command with `deprecated: 'new'` warns once on stderr and runs; `group` and `plugin` ride on the schema; `resolveCommand` and `runCommand` are public. The commander façade gains `.deprecate(use?)` and projects `.helpGroup()`. A required positional that argv did not supply is now a usage error naming it — it had never been enforced.
