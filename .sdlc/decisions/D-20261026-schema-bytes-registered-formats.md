---
id: D-20261026-schema-bytes-registered-formats
subject: 'Does `SCHEMA_BYTES_BUDGET` rise so `--schema` can name `tsv` in `output.formats` (agent-headroom RF)?'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets and trade-offs (burgee-owner-delegates-tradeoffs)'
date: '2026-10-26'
superseded_by: —
---

**Yes: 4,650 → 4,700 B, the next 50 B above the new reading, by the rule
[D-20261012-schema-bytes-budget](./D-20261012-schema-bytes-budget.md) sets.** The demo's
`--schema` read 4,650 B on `main` at `f6919e9c1a`, with no room left. `agent-headroom` RF
registers `tsv` as a format, and `--schema`'s `output.formats` has to name it. That costs the six
bytes of `,"tsv"`, and the reading is now 4,656 B.

**Value gained.** `--schema` stays true. `output.formats` is what an agent reads to learn which
`--format` values exist, and `formats.test.ts` holds it equal to what `--format` lists. Leaving
`tsv` out to stay under the budget would publish a schema that undercounts what the CLI does. That
trades a correct answer for six bytes, and the budget exists to stop the opposite trade.

**What it costs.** Six bytes in every `--schema` an agent reads of a program like the demo. A
program that registers formats of its own pays its names too. That is the cost of declaring
them, and the alternative is an agent probing `--format=<guess>`.

**What was refused.** Adding `--max-bytes` as a row under help's `Global options:`. That table is
`--schema`'s `global_args`, so the row would put about 90 B into every document, roughly 2% of the
demo's. It waits for a decision of its own, made against an agent-eval reading. For now the
budget is discovered from the spec and the changelog.

**Reversal.** Drop `tsv` from `outputOf` in `packages/burgee/src/clispec.ts`, and the budget
falls back to 4,650.
