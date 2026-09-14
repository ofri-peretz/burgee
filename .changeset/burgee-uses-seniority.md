---
'burgee': minor
---

**♻️ Refactor** — precedence and config discovery come from `seniority` rather than a second copy

burgee carried its own `precedence.ts` and `config.ts`; `config.ts` was byte-identical to
seniority's and `precedence.ts` differed by nineteen lines. Two copies of a precedence order
is two answers to "where did this value come from", and `--explain` is only worth anything
if the thing that picked the value is the thing that reports it.

The public surface is unchanged — `resolve`, `explain`, `envName`, `screaming`,
`ConfigError` and their types are still exported from `burgee`, now re-exported from
`seniority@^0.1.0`, which is a new runtime dependency.
