---
id: D-20261012-schema-bytes-budget
subject: 'What budget gates `schema-bytes`? (B-20261012-agent-schema-bytes-no-gate)'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets and trade-offs'
date: '2026-10-12'
superseded_by: —
---

**`SCHEMA_BYTES_BUDGET` is the demo's `--schema` measured on `main` when the gate lands, rounded
up to the next 50 B, and downward-only from there**, the same rule as paratext's `./plugin`
budget (D-20261012-agent-eval-turn-budget) and B4's core ceiling. On 2026-10-12 the
reading was 4,752 B (`4c85515`), which would give 4,800 B; the figure written is the one
measured on the day it is built, since #1074 and #1083 may add a key each.

**Value gained.** The next growth of the document an agent reads first is a decision, made in
the PR that grows it, instead of a band breach found after the fact.

**What the incumbent pays.** commander and yargs emit no schema, so no record is written for
them (`benchmarks/axes/reliability.ts`).

**Reversal.** Remove the `gate` from the record; the control band stays either way.
