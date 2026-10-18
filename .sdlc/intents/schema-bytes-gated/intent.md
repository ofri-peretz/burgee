# Intent — the schema an agent reads first has a budget

> Stage 1 artifact. Opened from the wave-4 ranking
> ([`next-wave-4-2026-10.md`](../../research/next-wave-4-2026-10.md)) to close gap
> `B-20261012-agent-schema-bytes-no-gate`.

**Status:** review · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

---

## What is wanted

burgee's `schema-bytes` record on the reliability axis carries a `gate`, as `skill-bytes` does at
`SKILL_BYTES_BUDGET`. A PR that grows the demo's `--schema` past the budget fails in that PR, and
raising the budget is a decision written in the same PR.

## Why now

- **The gap.** `schema-bytes` went from 1,678 to 4,752 B between `a049bc2` and `a2e4f98`, and the
  only signal was the `agent-schema-bytes` control band breaching after the fact
  (D-20261012-agent-schema-bytes-step-change). All four steps were accepted requirements; the next
  may not be.
- **Who pays.** `--schema` is the whole surface an agent reads to discover a CLI
  (`benchmarks/axes/reliability.ts`, the record's own note). Every byte is paid in every agent's
  context, on every program built on burgee.
- **The budget is decided.** D-20261012-schema-bytes-budget: the measurement on `main` when it
  lands, rounded up to the next 50 B, downward-only.

## Affected users and systems

- `benchmarks/axes/reliability.ts` (a `SCHEMA_BYTES_BUDGET` export and the record's `gate`).
- `benchmarks/` tests. Every PR that changes what `--schema` carries.

## Constraints

- **The band stays.** `.sdlc/bands/control-bands.json` does not change.
- **No incumbent record.** commander and yargs emit no schema; no zero is written for them.

## Success criteria

1. The reliability axis fails when the demo's `--schema` exceeds `SCHEMA_BYTES_BUDGET`.
2. A test proves it by running the gate against a reading one byte over.
3. Gap `B-20261012-agent-schema-bytes-no-gate` is `status: closed`, citing the PR.

## Jev triage

| user_impact | incumbent_gap | risk_reduced | composite | ready_for_spec | needs_model |
| --: | --: | --: | --: | :-- | :-- |
| 2 | 1 | 2? | 12 | yes | no |

## Open questions

- Which budget. **Decided 2026-10-12**, D-20261012-schema-bytes-budget.
