# Program — the contracts program, cut for parallel lanes

Vision: [`vision.md`](./vision.md) · Roadmap: [`roadmap.md`](./roadmap.md) · Metrics:
[`metrics.md`](./metrics.md) · Steps: [`../../PLAN.md` § Wave 6](../../PLAN.md#wave-6--the-contracts-program) ·
Lanes: [`../../LANES.md`](../../LANES.md) · **Status:** accepted 2026-11-18
([`D-20261118-contracts-program-go-ahead`](../../decisions/D-20261118-contracts-program-go-ahead.md)).

The roadmap says *what order the product grows in*. This file says *how a dozen agents build it at once
without touching each other's files*. Each workstream is one intent with its design, one lane, one
set of owned paths, and one command that says it is done.

## The workstreams

| Lane | Intent | What it delivers | Roadmap phase | Needs first |
| :-- | :-- | :-- | :-: | :-- |
| `ac-spine` | [`apicontract-gen-command`](../apicontract-gen-command/intent.md) | `gen` and `extract` that load config and plugins and write safely; the contract map | 1 | 6.0 |
| `ac-types` | [`apicontract-types`](../apicontract-types/intent.md) | The types plugin, 61/61 upstream, TS 5.9/6.0/7.0, types from JSON Schema | 1 | 6.0 |
| `ac-inputs` | [`apicontract-inputs`](../apicontract-inputs/intent.md) | JSON Schema, AsyncAPI 2.6/3.0, MCP, Swagger 2.0, OpenAPI 3.2 | 1–3 | 6.0 |
| `ac-validate` | [`apicontract-gen-validator`](../apicontract-gen-validator/intent.md) | `gen validator`, `gen json-schema`, provider dialects | 2 | 6.0 |
| `ac-extract` | [`apicontract-extract`](../apicontract-extract/intent.md) | Standard JSON Schema extract, the round trip, NestJS, Hono, tRPC/oRPC, ts-rest | 2–4 | 6.0 |
| `ac-servers` | [`apicontract-servers`](../apicontract-servers/intent.md) | NestJS, Hono, Fastify, Express; contract tests; Problem Details | 3–4 | 6.0 |
| `ac-clients` | [`apicontract-clients`](../apicontract-clients/intent.md) | `fetch` client, TanStack Query, MSW handlers | 4 | 6.0 |
| `ac-agents` | [`apicontract-agents`](../apicontract-agents/intent.md) | `gen mcp`, `explain`, `gen markdown` + `llms.txt` | 4–5 | 6.0 |
| `ac-diff` | [`apicontract-diff`](../apicontract-diff/intent.md) | `diff` over every format, modes, SARIF, changesets, MCP drift | 5–6 | 6.0 |
| `ac-kit` | [`apicontract-kit`](../apicontract-kit/intent.md) | Conformance suite (`apicontract/testing`), `plugin new`, `migrate` from openapi-typescript, openapi-fetch, Hey API, orval; `AGENTS.md` and the X3 eval | 3 | 6.0 |
| `ac-corpus` | [`apicontract-corpus`](../apicontract-corpus/intent.md) | Pinned real-world corpus, grader, consumer harness, the scoreboard | 0 | — (grades incumbents first; ours as each lane lands) |
| `validator` | [`validator`](../validator/intent.md) | Parity 143 → 154, Standard JSON Schema, the benchmark after parity | b–c | — |

"Needs first" is the only hard edge. Everything else is a soft edge: a lane writes against the
public host API (`Generator`, `Adapter`, `Contract`) and its own fixtures, and tests its `run()`
directly, so it does not wait for another lane to merge. Where a lane *uses* another's output (the
servers import the `validator` target's output by a path option; the kit's regeneration rule needs
the spine's owner rules), it uses the path option or an in-lane copy until the other has landed,
then switches in a follow-up. No lane imports another lane's internals: generators return bodies,
and the spine's writer adds headers. Every lane's "Done when" passes on its own fixtures; readings
that need the corpus or another lane are follow-ups, named in its intent.

What 6.0 already gives every lane in `host.ts` and `core/model.ts`, so none has to edit them:
`ContractFinding` and `Contract.findings`; a generator may return `{ files, findings }`; the
`Extractor` type and the `extractors` key; built-in adapters by name (`inputs.ts`), which
`checkPlugin` registers first so a plugin's sample reads without carrying its own adapter.

## Why the lanes do not collide

One package, `packages/apicontract`, carries ten lanes. That works only because step **6.0** shards
it first, the same move as PLAN's `SHARD` for `baseline.json`:

- every lane's code goes in files with its own prefix, because this repository's lint forbids
  parent-directory and barrel imports, so every package is flat (as `gen-ts-*.ts` already is):
  `input-<name>*.ts`, `plugin-<name>*.ts`, `plugin-extract-<name>*.ts`, `command-<name>*.ts`,
  `run-*.ts`, `diff-*.ts`, `extract-*.ts`, `testing*.ts`, `migrate-*.ts`, `scaffold*.ts`; fixtures
  under `src/__fixtures__/<lane>/`. No prefix is a prefix of another lane's;
- the three files every lane would otherwise append to are created once, by 6.0, with a line for
  every planned file already in them: `src/inputs.ts`, `src/plugins.ts` and `src/commands.ts`;
  each imports a stub (`input-<name>.ts`, `plugin-<name>.ts`, `command-<name>.ts`) that exports
  `undefined` or a refusing command until its lane replaces it;
- `package.json` gains pattern exports (`./plugin-*`, `./input-*`, `./testing`) once, so no lane edits it;
- `validator` becomes a workspace dependency of `apicontract` once, in 6.0, the only lockfile edit.

After 6.0 the owned paths in `LANES.md` are disjoint, which `scripts/lane-boundaries-lock.test.ts`
checks, and `npx tsx scripts/dispatch-lanes.ts --lane <name>` prints each lane's brief.

## The shared definition of done, for every generator and extractor

Every plugin PR in this program meets all of these; the lane intents add their own metric rows.

1. On the public host API only (X1 = 0) with a `sample` that `host.validate` accepts.
2. Deterministic: two runs, same bytes; output sorted by operation id.
3. Regeneration test: user-owned files unchanged after a spec change (N1 = 0).
4. Round trip where the target has an extract half (R-RT).
5. `npm run coverage -w apicontract` stays at the package's 100% thresholds, and
   `npm run mutation:changed` reports no survivor on the lane's lines (an equivalent mutant is
   excluded in the source with its reason, as the validator does).
6. A `fix:` line on every refusal and every non-zero exit (A3).
7. A finding, never a silent drop, for anything the target cannot express (J3, B3).
8. `npm run ci:local` and `npm run lint` green on the branch, except the artifact-size baseline,
   which the integrator bumps on merge (LANES.md).

## Waves

| Wave | Lanes running | Exit |
| :-- | :-- | :-- |
| **6.0** shard | integrator | `src/inputs.ts`, `src/plugins.ts`, `src/commands.ts` with flat stubs; pattern exports; `validator` dependency; lanes lock green |
| **A** foundation | `ac-spine`, `ac-types`, `ac-inputs` (JSON Schema, MCP first), `ac-kit` (conformance first), `ac-corpus`, `validator` | `gen` writes the types target on a fixture; JSON Schema and MCP read; corpus `--sample 100` runs |
| **B** first targets | `ac-validate`, `ac-agents` (`explain` first), `ac-extract` (Standard JSON Schema first), `ac-diff` (schema compare first) | Phase 2 exit rows J1–J3, R1–R3, B1 read |
| **C** frameworks | `ac-servers` (NestJS first), `ac-clients` (`fetch`, MSW), `ac-agents` (`gen mcp`), `ac-extract` (NestJS, ts-rest) | N1–N3 read; consumer harness boots NestJS and Hono output |
| **D** breadth | the remaining frameworks, AsyncAPI gateways, Swagger 2.0, dialects, MCP drift | each plugin's row in the roadmap catalogue read |

Waves are a recommended order for a machine that runs two lanes at a time (this one: endpoint
scanning saturates CPU beyond two install-and-test agents). With more capacity, every lane in A–C
can start at once after 6.0; the soft edges above make that safe.

## How a lane is dispatched

```bash
npx tsx scripts/dispatch-lanes.ts --lane ac-validate
```

prints the brief: owned paths, forbidden paths, the steps from `PLAN.md` Wave 6 with their "Done
when" commands. The agent works in a checkout of its own branch, opens its own PR against `main`, and
stops; it does not merge another lane's branch.
