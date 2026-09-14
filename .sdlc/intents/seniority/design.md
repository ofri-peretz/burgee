# Design — seniority

Intent: [`intent.md`](./intent.md). Umbrella:
[`cli-foundation-stack`](../cli-foundation-stack/design.md). **Status:** draft.

---

## Requirements

- **R1** `ORDER` is an exported array of source kinds, highest first:
  `['flag', 'env', 'config', 'package', 'default']` (**reconciled 2026-09-14 — see R14**;
  this requirement said `['flag','env','project','home','pkg','default']` when it was
  written, against no code). It is **data**: the resolver
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

  **Two of the four vendored and measured 2026-09-14 (PLAN 2.2–2.13). Neither is `active`,
  and the reason is the control, not the target** — see
  [§ The two suites, measured](#the-two-suites-measured) below for every number and every
  blocker. In one line each: `dotenv` 17.4.2 controls at **141 / 141, 100%**, and cannot be
  run by `npm run compat` at all because the oracle has no `tap` runner; `cosmiconfig`
  10.0.1 controls at **210 / 241, 87.1%** through the oracle as it stands and at
  **240 / 241, 99.6%** once the host's own two vitest options are applied, so the 28-case
  gap is harness rather than incompatibility.
- **R11 (Y9)** Nothing reads `process.*`; `env`, `cwd` and `argv` arrive as arguments.
- **R12** Where the resolved shape is described by a burgee manifest, values are validated
  against it and a violation is reported with its provenance — *"`out` must be a string;
  `./mytool.config.js:3` set it to `4`"*. Structurally typed, **no import of burgee** (Y1).

- **R13 (PRINCIPLES 14, PLAN D5)** `Source` is an **open** union —
  `'flag' | 'env' | 'config' | 'package' | 'default' | (string & {})`. The closed union
  makes the `sources` host of wave 1.3 a breaking change written as an additive one.
  Widening costs exactly one code change, measured on the real file 2026-09-13:
  `describe()` in `precedence.ts` is an exhaustive `switch` with no `default`, so the
  wider type trips `TS2366: Function lacks ending return statement`. Its `default` branch
  renders an unknown source as `` `${c.source} ${c.location}`.trim() `` — a plugin source
  therefore explains itself in `--explain` without seniority knowing its name. With that
  branch: 0 errors, 28 tests pass. Diff kept at `.sdlc/probes/open-union-widening.patch`.
  Ships at 0.2.0 with the host.

  **Built 2026-09-14.** The measurement held: one `default` branch, no other code change.
  49 tests pass.
- **R14** R1's `ORDER` and the shipped `Source` union disagree today — the design says
  `['flag','env','project','home','pkg','default']`, `precedence.ts` says
  `'flag'|'env'|'config'|'package'|'default'`. R13 does not resolve that; whichever wins,
  it is one array and one union that must be generated from the other. Reconciled in
  wave 1.3, before the host lands, so a plugin is not registering against two spellings.

  **Decided 2026-09-14: the shipped five win, and `ORDER` is now the declaration they are
  generated from.**

  `precedence.ts` exports `ORDER = ['flag','env','config','package','default'] as const`,
  and the union is `(typeof ORDER)[number]` widened per R13. There is no second place to
  write a source kind, so the drift cannot recur — which was R14's actual requirement, not
  "pick the nicer array".

  Three reasons the shipped spelling wins over the design's:

  1. **It is the one users have.** `provenance.source` is a *value*, not an internal name:
     0.1.0 already prints `package` and `config`, and `--explain` renders them. Renaming
     them to match a design nobody shipped would break every reader of a provenance record
     to buy nothing a reader can see.
  2. **`project` and `home` were never two kinds — they are one kind with two
     locations.** `config.ts` already discovers in that order (`candidates()` returns
     `current directory` then `user config directory`) and hands the winner to `resolve`
     as one `config` layer whose `location` is the **actual file path**. A source kind can
     only say "home"; `location` says `~/.config/mytool/config.json`. R3 asks for the
     precise answer, so splitting the kind would make `--explain` less specific, not more.
  3. **Six kinds would have been an unearned 64-row truth table.** The "2⁶ = 64
     combinations" line in this design counted a distinction the resolver does not make.
     Five kinds is the honest arity, and the conformance assertions enumerate what actually
     exists.

  What the design gives up by deciding this way: nothing in behaviour. What it gains: R1's
  "changing precedence is editing one array" becomes literally true — `ORDER` is iterated
  by `candidatesFor`, `RANK` is derived from its positions, and
  `precedence.test.ts` asserts the resolved candidate order *equals* `ORDER`, so an edit to
  the array that the resolver does not follow fails the suite.

- **R15 (`plugin-contract` R5a, PLAN 1.3)** `seniority/plugin` hosts **`sources`**: a record
  of `name → { rank, values | read(runtime), location? }`. **Built 2026-09-14.**

  Three decisions this design records, because each one is a place the host could have been
  built differently and been wrong:

  - **`rank` slots; it never reorders.** `RANK` gives the five built-ins `0, 10, 20, 30, 40`
    and a plugin's rank must be an integer *strictly* between `RANK.flag` and
    `RANK.default` — refused at `register()`, not clamped. A plugin may therefore insert a
    vault above the config file and below the environment, and may never beat the flag the
    user typed nor sink under the declared default. That is exactly how far *"the order is
    not configurable. A precedence a program can rearrange is a precedence nobody can
    reason about from the outside"* survives being extended. The sort is stable and every
    built-in is pushed before any plugin source, so a tie a host failed to refuse still
    loses to the built-in.
  - **A source may be data (`values`) or a reader (`read`), and exactly one.** R5a names
    `read(runtime)`; the contract's R7 says every contribution but a `frame` and burgee's
    hooks is inspectable without being run. Both are honoured by admitting the static form
    — a constant source is then readable by a `plugin check` — and requiring exactly one,
    because a source that declares both gives two answers to one question.
  - **Reading happens in `plugin.ts`, not in `resolve`.** `sources(runtime)` calls each
    `read` with the caller's own `{ env, cwd }` and returns plain `SourceLayer[]`, which is
    what `resolve` receives. `resolve` stays pure (R2) and nothing in the package touches
    `process.*` (R11) — the two properties that make `--explain` worth trusting.

  A `read` returning `undefined` contributes no candidate at all, rather than an empty one:
  `--explain` must not list a vault that was never reachable as a source that was consulted
  and lost.

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
  plugin.ts       the `sources` host — ORDER-ranked, read here not in resolve (R13–R15)
  schema.json     the family plugin schema, byte-identical       (plugin-contract R2)
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

## The two suites, measured

Both vendored 2026-09-14 by `npx tsx scripts/vendor-suite.ts <pkg> --verify`, each at the
annotated tag matching its published release, each `PROVENANCE` stamped `verified` against
the host. Both host rows are **`planned`**, not `active`, and both baseline fragments are
therefore inert until someone activates them. That is the honest state: a host whose control
cannot be run, or runs below its own reference, must not publish a rate.

| incumbent | release / tag / commit | files | control | target | target rate |
| :-- | :-- | --: | :-- | :-- | :-- |
| `dotenv` | 17.4.2 · `v17.4.2` · `f116f703` | 9 (7 gated, 2 internal-only) | **141 / 141 — 100.0%** | `seniority/dotenv` | **0 / 141 — 0.0%**, not built |
| `cosmiconfig` | 10.0.1 · `v10.0.1` · `219805f4` | 11 (9 gated, 2 internal-only) | **210 / 241 — 87.1%** as the oracle runs it; **240 / 241 — 99.6%** with the host's own vitest options | `seniority` | **3 / 241 — 1.2%** |

`cosmiconfig`'s target row is a real measurement, not a placeholder: the root export exists,
so the suite runs and three of its cases pass — `throws when trying to supply loaders`,
`throws when trying to supply searchStrategy`, and one TS-syntax-error case. R8's claim that
the default export matches cosmiconfig's is, at 1.2%, not yet true; 3.2 is where it becomes
true. `dotenv`'s 0 is the other kind of honest zero: `seniority/dotenv` does not exist, so
`missingTarget` reports it rather than running anything.

### Reproducing these numbers

Neither row can be reproduced by `npm run compat` today — that is finding 1 and finding 2
below, and it is why neither host is `active`. What each number *was* produced by:

- **cosmiconfig, both control rates and the target rate.** Install the suite's three
  packages into `packages/compat-oracle/vendor/cosmiconfig/node_modules`
  (`cosmiconfig@10.0.1`, `env-paths`, `parent-module` — out of tree, so the root lockfile is
  untouched), flip the host to `active` in `hosts.ts`, `npm run build -w compat-oracle`, then
  `node packages/compat-oracle/dist/bin.js cosmiconfig --control` for **210 / 241** and the
  same without `--control` for **3**. For **240 / 241**, add `restoreMocks: true,
  mockReset: true` to the `test` block of the generated `vendor/cosmiconfig/vitest.config.mjs`
  and run vitest over the nine public files directly — the config is rewritten on every
  oracle run, which is why this one is a hand step until finding 3 is fixed.
- **dotenv's 141 / 141.** One `node tests/<file>.js` per gated file from the vendored root
  with the outputs concatenated, then `summarize()` over the result — the loop finding 1
  describes, with `tap`, `sinon`, `decache` and `dotenv@17.4.2` installed beside the suite.
  The two counts that matter are countable by hand from the raw TAP: 141 lines matching
  `^ok`, none matching `^not ok`.

### What is blocking each row, and whose file it is

Five findings, every one of them outside `packages/seniority/**` and
`packages/compat-oracle/vendor/**`. They are recorded here rather than fixed because the
`harness` and `integrator` lanes own those files (`.sdlc/LANES.md`), and two lanes editing
one shared file is the thing lanes exist to prevent.

1. **No `tap` runner arm** (`compat-oracle/src/run.ts`, harness). dotenv's suite is
   node-tap. Its files emit flat TAP that `summarize()` already reads correctly — measured:
   `node tests/test-parse.js` prints `ok 1 …` through `1..47` at column zero, exactly the
   dialect `parseFlatTap` counts. What is missing is the *invocation*. `node --test
   --test-reporter=tap` is not it: measured, it collapses that 47-case file to a single
   `ok 1 - tests/test-parse.js`, which would grade 141 cases as 7. The arm is one spawn per
   file with the outputs concatenated — per-file plan lines restart at `ok 1` and
   `parseFlatTap` counts lines, not numbers, so concatenation needs nothing else. The
   141 / 141 above was produced by exactly that loop.
2. **Six undeclared packages** (`compat-oracle/package.json`, harness; `package-lock.json`,
   integrator). `vendored-suite.test.ts`'s install lock reads two manifests and neither
   declares `env-paths` or `parent-module` (cosmiconfig's suite), `tap`, `sinon` or
   `decache` (dotenv's), or the two incumbents themselves. **That lock is red on this branch,
   by design** — it names all six in its own failure message, which is a better handoff than
   a suite quietly left unvendored. It cannot be fixed from a package lane: declaring them
   without regenerating the lockfile breaks `npm ci` outright, and the lockfile is forbidden
   to every lane but `integrator`.
3. **The generated vitest config drops the host's own options** (`writeVitestConfig` in
   `run.ts`, harness). It writes `{ include, globals, setupFiles }` and nothing else.
   cosmiconfig's `vite.config.ts` sets `restoreMocks: true` and `mockReset: true`, and its
   suite depends on them: without them 28 cases in `successful-directories.test.ts` fail on
   a `readFileSync` spy that still holds the previous case's calls (`expected [ …(28) ] to
   deeply equal [ …(19) ]`). Adding just those two takes the control from 210 to 240. Those
   28 are harness noise in a published compatibility rate, which is the exact class of error
   the oracle exists to keep out of the number — the same shape as the ambient-colour
   finding already recorded in `run.ts`.
4. **An internal shim cannot resolve into a tarball that ships no source**
   (`writeInternalShims` in `run.ts`, harness). For a control it resolves
   `join(packageRoot(host), rel)`; cosmiconfig publishes `files: ["dist"]`, so
   `src/Explorer`, `src/ExplorerSync` and `src/types` are not there. `index.test.ts` imports
   and `vi.mock`s all three *and* imports the public entry, so `classify` calls it `public`
   and it gates — it is the one remaining control failure at 240 / 241. This is a new shape
   for C4: a file that is both internal-reaching and public-surface. Deciding it is 3.2's
   work, not a bug to patch quietly.
5. **The repository's own `.gitignore` swallows two of dotenv's fixtures** (root
   `.gitignore`, integrator). `git check-ignore -v` says `.gitignore:9:.env` matches
   `vendor/dotenv/tests/.env` and `.gitignore:10:.env.local` matches
   `vendor/dotenv/tests/.env.local`. Both are parsed by the suite — `tests/.env` alone feeds
   `test-parse.js`'s 47 cases — so a plain `git add` commits a suite that cannot run and
   says nothing. They are tracked here by `git add -f`, which is a workaround and not the
   fix: a rule written to stop secrets leaking should not be the reason a compatibility
   number is wrong, and the next incumbent with a dotfile fixture hits it again.

### Two things the host rows fixed rather than reported

Both are `hosts.ts` data, which is this lane's to write, and both were measured before and
after.

- **cosmiconfig's `test/util.ts`.** Ten of its eleven files import `TempDir` from
  `'./util'`, and `copySiblings` looks for a file at that literal name — TypeScript writes
  it with an extension, so the sibling is never found and every file fails to load.
  `extraDirs: ['test/util.ts']` brings it. Copying the whole `test/` directory instead also
  brings `test/tsconfig.json`, which vite's oxc transform reads and dies on
  (`[TSCONFIG_ERROR] Failed to load tsconfig ''` — 0 / 9, measured, and still 0 / 9 with the
  base it extends vendored alongside). Naming the one file is what works.
- **dotenv's `config.js` and its five dotfile fixtures.** `copyTests` copies directories
  whole and otherwise takes only files the glob matches, so no fixture beside the tests is
  ever copied, and `config.js` sits at the repo root rather than under `tests/`.
  `test-config-cli.js` spawns `node -r ./config` and scored 0 / 3 without it and 3 / 3 with
  it; `config.js` reaches the library through `./lib/main`, which is already a shimmed
  internal, so vendoring the file is enough to point it at whatever is being graded. Its
  fourth case is worth knowing about: dotenv's own `spawn` helper uses `timeout: 5000`, and
  on a cold first spawn the child exceeded it and returned empty stdout. Warm, 3 / 3. A
  control that flakes on the first run of the day is a real risk for this host.

## Verification

- `npm test -w seniority` — the truth table over `ORDER` (five kinds, not six: R14),
  `explain` on the four-source fixture, the bounded walk against a symlink cycle, R9's
  ceiling, R11's shape lock, and `src/plugin.test.ts` for R13–R15: a registered source wins
  a value and `--explain` names it, a rank outside `(flag, default)` is refused, and the
  built-in candidate order still equals `ORDER`.
- `npm test -w burgee` — the shared vectors, unchanged.
- `npm run compat -- cosmiconfig lilconfig dotenv rc` — four rows, `--control` first,
  ratcheting. **Two of the four are vendored; none is active yet, and the command refuses a
  planned host by name** (`✖ not an active host: cosmiconfig, dotenv`). Reproduce today's
  numbers with the recipes in [§ The two suites, measured](#the-two-suites-measured):
  `lilconfig` and `rc` are still unvendored (`rc` is PLAN 2.15, the harness lane's, because
  it grades through exit codes rather than a suite).
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
