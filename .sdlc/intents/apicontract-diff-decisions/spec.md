# Design — `apicontract diff` holds a change to the decision written in the contract

Intent: [`intent.md`](./intent.md). **Status:** approved.

---

## Requirements

- **R1. Markers are read, not diffed.** `x-change`, `x-sunset`, `x-replaced-by` and `deprecated`
  never produce a change finding of their own (today every `x-` keyword is skipped in
  `diff-schema.ts`; that stays). They are read into a `Decision` per member.
- **R2. Where a marker may sit.** On a schema member (any pointer inside a payload schema), on an
  operation object, or on a parameter. A marker anywhere else is `decision-misplaced`.
- **R3. Vocabulary is closed.** An `x-` key within edit distance 2 of a marker name (`x-chnage`,
  `x-sunst`) is `decision-misspelled` with the right name in its `fix:`. Other `x-` keys are
  ignored as today.
- **R4. Values are checked.** `x-change` is a non-empty string; `x-sunset` is `YYYY-MM-DD` and a
  real date; `x-replaced-by` is a JSON Pointer relative to the member's parent or a sibling name.
  A bad value is `decision-invalid`.
- **R5. A breaking change needs a decision** (`decision-missing`). A finding with verdict
  `breaking` passes when the new side has an `x-change` on the member at the finding's pointer,
  on any ancestor up to its payload root, or on the operation. A removed member's decision is
  read from the old side's `deprecated` + `x-sunset` (R8), since the new side has no member to
  carry it.
- **R6. A marker must match a change** (`decision-stale`). An `x-change` on the new side whose
  member had no finding of any verdict between old and new, and whose value is not identical on
  the old side, is stale. A marker carried over unchanged from the old side is history, not a
  claim, and is never stale.
- **R7. A sunset is carried out** (`decision-overdue`). A member on the new side with
  `x-sunset` earlier than `--today` (default: today's UTC date) still exists.
- **R8. A removal on schedule needs no new marker.** Removing a member whose old side carried
  `deprecated: true` and an `x-sunset` on or before `--today` satisfies R5.
- **R9. A replacement exists** (`decision-replacement-missing`). `x-replaced-by` resolves to a
  member on the new side.
- **R10. A decided breaking change moves the version** (`decision-unversioned`). When R5 passed
  through an `x-change`, either the operation's path gained a new major segment (`/v3/` → `/v4/`),
  `info.version`'s major moved, or `--changeset` is given (which already writes a major bump).
- **R11. Warn first.** `--decisions warn|error|off`. Default `warn` in the release that ships it;
  `error` from the next minor (a changeset note says so). `warn` findings print and appear in
  SARIF at `warning` level; they do not change the exit code.
- **R12. The setting comes from the base ref.** When the old side is `git:<ref>:<path>`, the
  `diff.decisions` setting is read from `apicontract.config.json` at that ref, if present, over the
  working tree's. A CLI flag still wins (it is in the CI file, which has its own owner).
- **R13. Every finding has a pointer, a `fix:` and a SARIF location** on the new side (the old
  side for a removal), like every other `diff` finding.

## Design

**Shape.** A new module `diff-decisions.ts` takes the `Comparison` that `compareContracts`
already returns, plus both contracts, and returns extra findings. It does not touch
classification.

```ts
interface Decision { change?: string; sunset?: string; replacedBy?: string; deprecated?: boolean; pointer: string }

const decisionsOf = (contract: Contract): Map<string, Decision>;          // key: operation id + pointer
const checkDecisions = (old: Contract, nu: Contract, comparison: Comparison,
  options: { today: string; level: 'warn' | 'error' }): DecisionFinding[];
```

`DecisionFinding` reuses `Finding`'s fields with `scheme: 'apicontract'` and ids `ac-decision-*`,
so SARIF, `--json` and text output need no new code path. `Comparison` gains
`decisions: readonly Finding[]` (empty when `off`), and `verdict` counts them only at `error`.

**Walking.** `decisionsOf` walks each payload schema with the same pointer scheme the diff uses
(`diff-schema.ts`), so a decision and a finding at the same member have the same key. Operation-
and parameter-level markers are read from `contract.document` at `operation.source`.

**Order of work.**

1. `decisionsOf` with R2–R4 (pure, on one contract).
2. R5, R8 against an existing `Comparison`.
3. R6, R7, R9.
4. R10 (path segment, `info.version`, `--changeset`).
5. CLI: `--decisions`, `--today`, base-ref config read (R11, R12).
6. README worked example: `Balance` and `gift_sent`.

**Files.** New `diff-decisions.ts`, `diff-decisions.test.ts`, fixtures under
`__fixtures__/diff-decisions/`. Changed `diff-contract.ts` (the `decisions` field),
`command-diff.ts` (flags, output), `run-config.ts` (`diff.decisions`).

## Verification

- **One command:** `npx vitest run packages/apicontract/src/diff-decisions.test.ts` exits non-zero
  when any requirement breaks.
- **Each rule proven to fail on the unfixed state** (working agreement rule 4): one fixture pair
  per requirement R3–R10, each asserting the finding id. Mutation testing on the changed lines
  (the pre-push `mutation-changed` gate) holds it.
- **No regression on unmarked contracts:** a test runs `diff` with `--decisions error` over the
  existing `diff-contract.test.ts` fixture pairs that carry no markers and asserts every R5
  finding is the only new output and that verdicts and `summary` are unchanged at `warn`.
- **Determinism:** `--today 2027-01-01` pinned in every test; no test reads the clock.

## Rejected alternatives

- **A decision file beside the spec** (`decisions.yaml` keyed by pointer). It drifts from the
  member it describes when the member moves; a marker moves with it.
- **Requiring `x-change` to be an ADR id format.** Teams use tickets, ADRs and URLs; the value is
  opaque and never fetched.
- **Treating `deprecated: true` alone as a decision.** Deprecation without a date is the
  forgotten-decision case this intent exists to end.
- **Reading markers from the old side for R5.** The decision belongs to the change, so it is on
  the side that makes it. The old side is read only for removals (R8) and staleness (R6).

## Out of scope

- The `contract-change-review` playbook (an agent's how-to for meaning changes). It reads
  `--json`; it is written separately.
- Checking who approved a marker. That is CODEOWNERS on the spec file, outside `diff`.
- Markers on AsyncAPI channels and MCP tools beyond the schema-member and operation positions,
  until a user asks.
