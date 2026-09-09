# Design — seniority

Intent: [`intent.md`](./intent.md). Umbrella:
[`cli-foundation-stack`](../cli-foundation-stack/design.md). **Status:** draft.

---

## Requirements

- **R1** `ORDER` is an exported array of source kinds, highest first:
  `['flag', 'env', 'project', 'home', 'pkg', 'default']`. It is **data**: the resolver
  iterates it, the truth-table page is generated from it, and the conformance test
  enumerates every subset of sources against it. Changing precedence is editing one array.
- **R2** `resolve(spec, layers) → { values, provenance, explain }` is **pure** over
  `{ flags, env, files, pkg, defaults }`. Purity is what makes `explain` trustworthy; it is
  also what `packages/burgee/src/precedence.ts` already is, and the two share
  `precedence-vectors.json`.
- **R3 (Y6)** `provenance: Record<key, { source, location?, line? }>` for **every** resolved
  key, always — not behind a flag. `location` is the absolute file path for file sources,
  the variable name for `env`, the flag token for `flag`.
- **R4 (Y5)** `explain(key)` returns `{ winner, candidates[] }` — the winning source and
  every source that set the key and lost, in `ORDER`. One record; human text, `--json` and
  an agent event are three renderings of it.
- **R5** Discovery: `search(name, { cwd, stopAt })` walks upward with `fs.existsSync`,
  bounded by depth and by `stopAt` or the filesystem root (Y10), and resolves symlinks
  without following a cycle twice. Roughly thirty lines, internal, **not exported as a
  product** — but exported as a function, because `find-up`'s override needs a callable.
- **R6** Loaders are injected: `{ '.json': ..., '.js': ..., '.mjs': ..., '.cjs': ... }`
  builtin; `.yaml`, `.json5`, `.toml`, `.ini` accepted from the caller and never bundled
  (constraint 3). An unknown extension with no loader is a `USAGE`-class error naming the
  extension and the option that would supply one.
- **R7** `extends: string | string[]` resolves relative to the extending file or through
  `node_modules`, deep-merges left to right, rejects cycles, and the chain appears in
  `explain` — the same semantics `commander-env` V7 already ships, so the vectors are shared.
- **R8 (Y3)** Root default export matches `cosmiconfig`'s; `./dotenv`, `./rc` and `./find-up`
  are separately graded compatibility subpaths, each its own override target. Subpath
  isolation locked as in `roundel`.
- **R9 (Y8)** Ceilings: bytes and spawn delta at or under `lilconfig` (0 deps, 71 M/wk, the
  lightest in the layer) — not under `cosmiconfig`, which would be a free pass.
- **R10 (Y7)** `cosmiconfig`, `lilconfig`, `dotenv` and `rc` suites vendored into
  `compat-oracle`, `--control` first, ratcheting.
- **R11 (Y9)** Nothing reads `process.*`; `env`, `cwd` and `argv` arrive as arguments.
- **R12** Where the resolved shape is described by a burgee manifest, values are validated
  against it and a violation is reported with its provenance — *"`out` must be a string;
  `./mytool.config.js:3` set it to `4`"*. Structurally typed, **no import of burgee** (Y1).

### Evidence

| R | What supports it | Standing |
| :-- | :-- | :-- |
| R1 | ten of ten CLIs surveyed have config and env; **three document the order** (V8) | measured |
| R2 | `packages/burgee/src/precedence.ts`, 153 lines, shipped and green in wave 3 | shipped |
| R3, R4 | no incumbent in the layer records provenance; `--explain` has no ecosystem equivalent | **the differentiator; a hypothesis until an adopter uses it** |
| R5 | `find-up` → `locate-path` → `p-locate` → `path-exists` = **809 M/wk** for an upward walk | measured 2026-09-09 |
| R6 | `js-yaml` 264 M + `json5` 205 M + `yaml` 176 M + `ini` 102 M = 747 M/wk deliberately not taken | measured |
| R7 | `commander-env` V7 shipped in wave 3 | shipped |
| R9 | the lightest zero-dep incumbent in the layer is `lilconfig` | measured |
| the position | `config-layers` first published **2026-09-08** | **unknown — read it before F3 opens** |

## Design

```text
packages/seniority/src/
  order.ts        ORDER, the exported precedence data                         (R1)
  resolve.ts      the pure resolver; values + provenance                      (R2, R3)
  explain.ts      winner + candidates, and its three projections              (R4)
  search.ts       the bounded upward walk, ~30 lines                          (R5, Y10)
  load.ts         builtin JSON/JS loaders; injected loaders for the rest      (R6)
  extends.ts      chain resolution, deep merge, cycle rejection               (R7)
  validate.ts     manifest-shaped validation, structurally typed              (R12)
  runtime.ts      the structural Runtime shape, nine lines, no import         (Y9)
  index.ts        default = cosmiconfig's default; named re-exports
  truth-table.test.ts   every subset of sources × ORDER                       (R1)
  weight.test.ts  R9 · shape.test.ts  R8, R11
  __fixtures__/precedence-vectors.json   shared with packages/burgee          (R2)
```

**Order.** Extract `precedence.ts` → `order` + `resolve` + `explain` → `search` → `load` →
`extends` → `validate` → vendor the four suites → B4 rows and the discovery-chain row → the
override recipes, each behind its own pass rate.

**The truth table is the product.** `ORDER` as data means the conformance test enumerates
every subset of the six sources — 2⁶ = 64 combinations — asserts the winner in each, and the
docs page is generated from the same array. That is what "precedence is a declared truth
table testable per rule 4" means concretely, and it is the thing no incumbent can produce,
because none of them has the order written down anywhere but in control flow.

**Why `burgee` does not import this.** Reversing that arrow would make the engine's zero-dep
claim conditional on this package (Y1). Instead `precedence.ts` stays where it is and both
suites read `__fixtures__/precedence-vectors.json`. A divergence in the order fails both,
which is a stronger guarantee than a shared import would give, because it also catches the
case where one side is *changed on purpose* and the other is forgotten.

**Provenance costs one field.** The resolver already walks sources in order to pick a
winner; recording which one won is a write, not a second pass. That it is free is exactly
why its absence across sixteen packages is a pace finding rather than a capability one.

## Verification

- `npm test -w seniority` — the 64-row truth table, `explain` on the four-source fixture,
  the bounded walk against a symlink cycle, R9's ceiling, R11's shape lock.
- `npm test -w burgee` — the shared vectors, unchanged.
- `npm run compat -- cosmiconfig lilconfig dotenv rc` — four rows, `--control` first,
  ratcheting.
- `npm run bench -- --foundation` — the discovery-chain row: `cosmiconfig` + its six
  transitive helpers against this package, on installed bytes and on resolve latency.
- **The check that would have caught the original problem.** The original problem is a value
  whose origin nobody can name: `out` is `lib` and four sources could have set it. The check
  is a fixture with **all six sources setting the same key at once**, asserting both the
  winner and that `explain` names the exact file and line of each loser. It fails against
  every incumbent — none can produce the record at all — and that failure is checked in as
  the control, so the check is known to work rather than assumed to.

## Rejected alternatives

- **Bundling YAML.** It would make this the biggest package in the family and put every
  config release behind a spec's cadence. Loaders are injected instead; the 747 M/wk stays
  measured and unclaimed.
- **Publishing the discovery plumbing** (`find-up`, `locate-path`, `p-locate`,
  `path-exists`). Best evidence, worst products: not CLI-specific, four audiences we have no
  edge with. `./find-up` exists as an override target only, which takes the tree without
  taking the maintenance.
- **`burgee` importing `seniority`.** Reverses Y1 and makes the engine's zero-dep claim
  conditional. Shared vectors instead.
- **Provenance behind a `debug` flag.** Then it is not answerable when it matters, which is
  in a CI log an agent is reading after the fact. Always on, one field.
- **Following `cosmiconfig`'s search-places model exactly.** It is larger than the truth
  table needs and its cache semantics are its own. Compatibility is graded by its suite; the
  native API is the truth table, and every divergence gets a listed reason (C-series).
- **Async-first.** `fs.existsSync` in a bounded loop is fast, and a sync core keeps the API
  and the grading surface small. A dual API is a real possibility for `.ts` configs and is
  the intent's first open question, not a default.

## Out of scope

- Format parsers (YAML, JSON5, TOML, INI) — a different family under rule 10.
- Config **writing**: `conf` and `configstore` (24.8 M/wk) persist state. Reading and
  resolving is this layer; a state store is a different product with a different contract.
- Secret management, encryption, or remote configuration. Y-series is local and offline; a
  network call at startup is the opposite of what an agent wants (the same reason the
  roadmap refuses an update checker).
- Schema *authoring*. `burgee` emits the schema; this validates against a shape structurally.
