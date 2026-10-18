# Design — the schema an agent reads first has a budget

Intent: [`intent.md`](./intent.md). **Status:** review.

---

## Requirements

- **R1 — A committed budget.** `export const SCHEMA_BYTES_BUDGET` in
  `benchmarks/axes/reliability.ts`, set per D-20261012-schema-bytes-budget, with a dated comment
  naming the measurement and commit. *Check:* `benchmarks/reliability.test.ts` imports it; red on
  main, there is no such export.
- **R2 — The record is gated.** burgee's `schema-bytes` record carries
  `gate: { max: SCHEMA_BYTES_BUDGET, why }`, the shape `skill-bytes` uses. *Check:* the same test
  asserts the record has a gate and that a reading of `SCHEMA_BYTES_BUDGET + 1` fails it; red on
  main, the record has no `gate`.
- **R3 — The gap closes.** `B-20261012-agent-schema-bytes-no-gate` set to `status: closed` with
  the PR. *Check:* `npm run ledger -- gaps --open` no longer lists it (`gaps-lock` reads the file).

## Design

Copy `skill-bytes`' gate (lines 186 and 234 of `reliability.ts` on 2026-10-12) onto the
`schema-bytes` record at line 225. One PR.

## Verification

| R | Check | Red on main |
| :-- | :-- | :-- |
| R1, R2 | `benchmarks/reliability.test.ts` | no export, no gate |
| R3 | `scripts/gaps-lock.test.ts`, `npm run ledger -- gaps --open` | gap open |

No state machine; no model.

## Rejected alternatives

- **Widen the control band.** Refused by D-20261012-agent-schema-bytes-step-change: it would
  measure nothing afterwards.
- **A budget with headroom.** Headroom is how drift slips in; the rule rounds to 50 B and no more.

## Out of scope

- Per-command `--schema <command>` documents, which a program's size decides.
- Shrinking the document. That is a design of its own, and every key in it is an accepted
  conformance requirement.
