---
id: D-20261012-typed-positionals-shape
subject: 'What does `ArgumentSpec` gain so positionals are typed and named, and how is it projected?'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets and trade-offs'
date: '2026-10-12'
superseded_by: —
---

**`ArgumentSpec.type` widens from `'file'` to `'string' | 'number' | 'integer' | 'boolean' |
'file'`, and it gains `choices?: readonly string[]`; the handler reads `ctx.args.<name>`, typed
from the declaration, beside `ctx.positionals`, which is unchanged.** A value that fails its type
or its choices is the same usage error, exit 2, with the same `fix`, that an option's value gets.
`--schema`, `--mcp`'s `inputSchema` and completions read the two keys from the manifest, so every
front-end that fills them gets them at once, and `burgee/commander` fills `choices` from
`argChoices` (B-20261012-commander-argument-choices).

**Why not a `schema` key (a JSON Schema per argument).** It is what citty #84 asks for, and it
is a second validation language inside the manifest; options have no such key either. An option
and an argument take the same vocabulary or neither does.

**Bytes.** *Unmeasured*. The gap measured the smallest façade version at 61,132 B against a
61,100 B ceiling for `./commander`; `spec.md` names the budget rule: the measurement rounded up
to the next 50 B, recorded in a dated comment, as D-20261012-mcp-current-budget did.

**Reversal.** The keys are additive; removing them is a major.
