# Design — the schema an agent reads first has a budget

Intent: [`intent.md`](./intent.md). **Status:** shipped — accepted by the coordinator under the
owner's delegation, [`D-20261020-schema-group-design-accepted`](../../decisions/D-20261020-schema-group-design-accepted.md), as re-grounded below, and built in the `feat/schema-group` PR.

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

## Re-grounded 2026-10-20

Against `main` at `326907ec`:

- **The budget's figure.** The demo's `--schema` reads **4,628 B** (#1074 and #1083 moved it
  from the 4,752 B the decision quoted), so `SCHEMA_BYTES_BUDGET` is **4,650**, the next 50 B up.
- **The record's unit.** `schemaBytes` counted `stdout.length`, UTF-16 code units, under
  `unit: 'bytes'`. It counts `Buffer.byteLength(…, 'utf8')` now, as `skill-bytes` does; the
  demo's document is ASCII, so its reading did not move. The test's fixture pads with a two-byte
  character, so a count of characters fails it.
- **Line references.** `skill-bytes`' gate and the `schema-bytes` record had moved; the gate is
  copied from where they stand.

## Build status

Built in the `feat/schema-group` PR against `main` at `326907ec`. Each check was red on `main` first.

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | Built | `benchmarks/axes/reliability.ts` (`SCHEMA_BYTES_BUDGET = 4_650`) | `benchmarks/reliability.test.ts` › the budget (red: `NaN`) |
| R2 | Built | the `schema-bytes` record's `gate` | `reliability.test.ts` › gated at the budget; one byte over fails (red: no gate) |
| R3 | Built | `.sdlc/gaps/B-20261012-agent-schema-bytes-no-gate.md`, `status: closed` | `npm run ledger -- gaps --open` |

**Built: 3. Not built: 0.** `npm run bench -- --axis reliability --check` reports 0 gate failures
on the branch, with the demo at 4,628 B.
