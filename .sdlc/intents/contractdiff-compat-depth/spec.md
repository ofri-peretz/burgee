# Design — `contractdiff diff` as deep as the registries, and selection for agents

Intent: [`intent.md`](./intent.md). **Status:** approved.

---

## Requirements

- **R1. Transitive.** `diff --transitive <old…> <new>`: the old side is a list (files, `git:<ref>:<path>`
  per ref, or a directory read in version order). `new` is compared with each; findings carry
  `against` (the old side they break) and the report names the oldest broken release. Exit as for the
  worst verdict across all comparisons.
- **R2. `dangerous`.** `Verdict` gains `dangerous`, ranked between `unknown` and `non-breaking`.
  Classified dangerous, under any mode: an enum value added in a response (exhaustive readers), a
  response member made nullable, a default changed, a pattern or format loosened on a response.
  `--dangerous-breaking` reports them as `breaking`. Default output lists them and does not change
  the exit code.
- **R3. Usage.** `--usage <file>`: JSON `{ operations: { [id]: { members?: string[] } } }`, or an
  `apicontract.map.json` from a client generation. A breaking finding on an operation or member absent
  from the file becomes `non-breaking` with `note: "unused"`; a used one keeps its verdict and gains
  `usedBy` when the file names callers. Without the flag nothing changes.
- **R4. Frozen.** `x-frozen: true` on a member, operation or document: every change under it is
  `breaking` regardless of mode or side, with rule id `ac-frozen-changed`.
- **R5. Wire levels** (lands with the protobuf adapter, not before): `--level file|package|wire-json|wire`
  maps buf's categories onto the classifier; until protobuf is read, the flag is refused with a
  `fix:` naming the format list.
- **R6. A size budget for MCP tools.** `gen mcp` already selects with `include` (`tag:<name>` or
  ids, required past 40 operations). Add `budget` (tokens): the generated tool list's estimated size
  (characters ÷ 4, stated as an estimate) is reported, and a list over budget is refused with the
  largest tools named and a `fix:` to narrow `include`. Operations tagged `internal` or `health` are
  excluded unless named.
- **R7. `contractdiff:agent-ready` ruleset** (a `lint` plugin, lands with `apicontract-lint`):
  every operation, parameter and property described; operation descriptions ≤ 300 characters;
  examples valid against their schema; no two operations whose descriptions overlap above a threshold;
  every operation has an `operationId`. All `warn` by default.

## Design

R2 and R4 change the classifier (`diff-classify.ts`, `diff-rules.ts`) and are proven against the
existing `compat.qnt` model: `dangerous` is a refinement of `non-breaking`, so every trace the model
calls compatible stays compatible unless promoted. R1 wraps `compareContracts` in a loop and merges
findings by id + pointer, keeping the oldest `against`. R3 is a post-pass over findings. R6 is in
`plugin-mcp.ts` beside `include`. R7 waits for `lint`'s rule shape.

Order: R4 → R2 → R1 → R3 → R6 → R7 (with lint) → R5 (with protobuf). Each a PR.

## Verification

- `npx vitest run packages/contractdiff/src/diff-*.test.ts` per step, with one fixture per requirement
  that fails without it (the three-release fixture for R1, the enum fixture for R2, an unused-removal
  fixture for R3, a frozen-member fixture for R4).
- `models.yml` stays green: `compat.qnt` invariants hold with `dangerous` added.
- R6 on the corpus's largest OpenAPI document: `budget: 4000` refuses the full list and accepts a
  tag-selected one.

## Rejected alternatives

- **A registry service storing versions.** Git history and a directory of releases are the registry.
- **Making `dangerous` breaking by default.** It would change verdicts every existing CI relies on.
- **Collecting usage ourselves.** Usage is data the user hands in; no telemetry.

## Out of scope

Protobuf, Avro and GraphQL readers themselves (their own intents under the open-formats decision).
