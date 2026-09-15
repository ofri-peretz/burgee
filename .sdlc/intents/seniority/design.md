# Design — seniority

Intent: [`intent.md`](./intent.md). Umbrella:
[`cli-foundation-stack`](../cli-foundation-stack/design.md). **Status:** draft.

**Build state, 2026-09-15 (PLAN 3.2).** Every requirement's status is in
[§ What is built](#what-is-built), which is the list 3.2's "Done when" reads. Fourteen of the
fifteen are built; **R10 is the one that is not, and it is not this package's to finish** —
two of its four suites are still unvendored and one of those two is another lane's by the
plan's own assignment. The headline measurement: `cosmiconfig` 10.0.1's own suite grades
`seniority` at **186 / 241, 77.2%**, up from 3 / 241, against a control of **240 / 241**, and
**every one of the 55 remaining failures is one of the two divergences listed below** — 54 of
them the absent YAML parser, one of them the harness.

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

  **Built 2026-09-15, with the same correction R14 made and for the same reason.** The record
  is `explanation()` in `src/explain.ts`; `explain()` keeps the string signature 0.1.0 shipped,
  because `provenance` and `explain`'s output are *values users already have* and a design is
  not a reason to take one away. What makes the three renderings renderings rather than three
  implementations is mechanical rather than reviewed: `explain` is literally
  `renderExplanation(explanation(…))`, and `explain.test.ts` asserts the two are the same
  bytes. The record also separates `lost` from `unset` — "the config file said `lib` and the
  flag beat it" and "there is no config file" are different answers, and conflating them is
  the thing `--explain` exists to stop.

  `explain.ts` **imports nothing**. The two shapes it reads are declared structurally, so
  `precedence.ts` can import it without a cycle — which is also why a caller with its own
  candidate type can render one.
- **R5** Discovery: `search(name, { cwd, stopAt })` walks upward with `fs.existsSync`,
  bounded by depth and by `stopAt` or the filesystem root (Y10), and resolves symlinks
  without following a cycle twice. Roughly thirty lines, internal, **not exported as a
  product** — but exported as a function, because `find-up`'s override needs a callable.

  **Built 2026-09-15** as `src/search.ts`. Three bounds, not one: `stopAt`, `WALK_LIMIT` (64
  directories) and the filesystem root, whichever comes first — a bind mount or a container
  overlay presents as an ancestor chain that is long rather than infinite, and the root alone
  does not stop that. Directories are compared by **real path**, so a link pointing back at an
  ancestor ends the walk instead of spinning it to the limit and reporting a miss that took 64
  stats. And proximity outranks the name: every name is checked in one directory before the
  walk steps up, because that is the question an upward walk is being asked.

  `discover` uses it only when a program says `upward: true`. A config found in a directory
  the user did not name is the sort of surprise `--explain` exists to prevent, so it is a
  decision rather than an ambient behaviour.
- **R6** Loaders are injected: `{ '.json': ..., '.js': ..., '.mjs': ..., '.cjs': ... }`
  builtin; `.yaml`, `.json5`, `.toml`, `.ini` accepted from the caller and never bundled
  (constraint 3). An unknown extension with no loader is a `USAGE`-class error naming the
  extension and the option that would supply one.

  **Built 2026-09-15** as `src/load.ts`. The refusal is `USAGE` (exit 2) and not `CONFIG`
  (exit 3) on purpose: `CONFIG` tells the user their configuration file is wrong and sends
  them to read a file that may be perfectly good, when the mistake is the program's, one line
  up, where it did not declare the loader it needs. `NOT_BUNDLED` names the five extensions
  this package declines, and `load.test.ts` asserts each is absent from `defaultLoaders` — the
  747 M/wk is declined in code, not only in prose.
- **R7** `extends: string | string[]` resolves relative to the extending file or through
  `node_modules`, deep-merges left to right, rejects cycles, and the chain appears in
  `explain` — the same semantics `commander-env` V7 already ships, so the vectors are shared.
- **R8 (Y3)** Root default export matches `cosmiconfig`'s; `./dotenv`, `./rc` and `./find-up`
  are separately graded compatibility subpaths, each its own override target. Subpath
  isolation locked as in `roundel`.

  **Built 2026-09-15, and this is what 3.2 was for.** Before: **3 / 241, 1.2%** — the root
  export existed, so the suite ran and three cases passed. After: **186 / 241, 77.2%**,
  three consecutive runs, reproducible on a clean checkout with nothing installed beside the
  suite. The claim "the default export matches cosmiconfig's" is now measured rather than
  asserted, and where it stops is itemised in
  [§ Where the 186 stops, exactly](#where-the-186-stops-exactly).

  What that took, in the order the number moved:

  1. **The surface**: `cosmiconfig`, `cosmiconfigSync`, `Explorer`, `ExplorerSync`,
     `defaultLoaders`, `defaultLoadersSync`, `getDefaultSearchPlaces(Sync)`,
     `globalConfigSearchPlaces(Sync)`, `metaSearchPlaces`, `decodeFileContent`,
     `getPropertyByPath` — the three `searchStrategy` walks, the two caches, `$import` with
     `mergeImportArrays`, the meta-config merge, and the error strings verbatim. 3 → 109.
  2. **`fs` reached through the module object, not through a named binding.** cosmiconfig's
     suite asserts *which files were read*, by spying on `fs.readFileSync` and
     `fsPromises.readFile` — 98 of its cases do — and a spy patches the property, not a
     binding captured at import. With `import { readFile } from 'node:fs/promises'` the same
     implementation read **109**; through `fsPromises.readFile` it read **186**. Seventy-seven
     cases turned on an import style, which is a compatibility surface nobody would think to
     write down.

  Three of cosmiconfig's behaviours are reproduced although they read like accidents, because
  a façade that fixes its host's quirks is not a façade: `#validateConfig` says
  `extension ".foorc.things"` for a whole search place; a meta config outranks the program's
  own options; and `searchStrategy` is never validated.

  **The subpaths.** `./cosmiconfig`, `./dotenv` and `./find-up` are separate entry points with
  separate files, locked by `shape.test.ts` — a program overriding `dotenv` must not thereby
  acquire the cosmiconfig façade, because the two are graded separately and a shared entry
  would make one suite's rate depend on the other's module graph. `./rc` is deliberately not
  here: PLAN 2.15 assigns `rc` to the harness lane, and building a façade for a suite this
  repository cannot yet run would be a surface with no gate on it.

  **`seniority/dotenv` has exactly one divergence, and it is R11.** `parse` and `populate` are
  dotenv 17.4.2's, grammar included — its line regex is reproduced character for character,
  because its edge cases are what people file issues about and "cleaner" here would mean
  "different". `config()` takes the object to populate as `processEnv`, an option dotenv
  itself already has, and **refuses rather than guessing** when it is absent. A caller writes
  `config({ processEnv: process.env })`: one word, at the one place a program is entitled to
  own its process. The alternative was to reach the ambient environment through a guarded
  global, which would have slipped past the repository's process lock without appearing on its
  allow-list — a rule defeated by spelling, which is a defect this repository has caught in
  itself before.
- **R9 (Y8)** Ceilings: bytes and spawn delta at or under `lilconfig` (0 deps, 71 M/wk, the
  lightest in the layer) — not under `cosmiconfig`, which would be a free pass.

  **Built 2026-09-15** as a lock in `src/shape.test.ts`, against the **built** `dist` and not
  against the source: 95,907 B today, ceiling 140,000 B, plus a floor so a build that produced
  nothing cannot pass the ceiling with flying colours.

  What that ceiling is and is not, stated so nobody reads it as a claim it does not make. It
  is **a bound on this package's own growth**, not "smaller than lilconfig": seniority also
  carries `resolve`, `explain`, the plugin host and three façades, none of which lilconfig
  has, so a byte-for-byte comparison would be against a different product. What the lock
  actually prevents is the thing weight locks exist for — a dependency or a bundled parser
  arriving unnoticed, which moves this by an order of magnitude rather than by a few hundred
  bytes. The **spawn-delta** half of R9 is the `bench --axis weight` row and belongs to the
  benchmark suite, not here.
- **R10 (Y7)** `cosmiconfig`, `lilconfig`, `dotenv` and `rc` suites vendored into
  `compat-oracle`, `--control` first, ratcheting.

  **Two of the four vendored; two still unvendored, and one of those is another lane's.** This
  is the one requirement 3.2 does not finish, and the part of it that is in this lane's gift
  was done — see [§ The two suites, measured](#the-two-suites-measured) for every number and
  every remaining blocker.

  - `cosmiconfig` 10.0.1: control **240 / 241, 99.6%** (was 210 / 241 before the host's own
    two vitest options were carried across), target **186 / 241, 77.2%** (was 3 / 241). Still
    `planned`, and now for exactly **one** reason rather than two — see finding 2 below.
  - `dotenv` 17.4.2: control **141 / 141, 100%**, ungradeable by `npm run compat` because the
    oracle has no `tap` runner. Settled and not worth reopening: node-tap pulls **203 packages
    and 140 MB**, measured, which this repository will not commit beside a suite or put in its
    lockfile. The row stays `planned` and unnumbered, which is the honest form.
  - `lilconfig`: not vendored.
  - `rc`: not vendored, and PLAN 2.15 assigns it to the harness lane because it grades through
    exit codes rather than a suite.
- **R11 (Y9)** Nothing reads `process.*`; `env`, `cwd` and `argv` arrive as arguments.

  **Held through 3.2, which is where it cost something.** Two of this step's files wanted the
  process and were written not to: the cosmiconfig façade's global config directory is derived
  from `os.homedir()` and the platform (and overridable through `globalConfigDir`) rather than
  read from `XDG_CONFIG_HOME`/`APPDATA` through `env-paths`, and `seniority/dotenv`'s `config`
  takes its `processEnv` as an argument. Both are listed divergences rather than silent ones.
  `shape.test.ts` checks it inside this package, where whoever broke it is working; the
  repo-wide lock is `packages/burgee/src/process-reference-lock.test.ts`, on whose allow-list
  seniority has **no entry at all** — which is the claim, and the only form of it worth
  having.
- **R12** Where the resolved shape is described by a burgee manifest, values are validated
  against it and a violation is reported with its provenance — *"`out` must be a string;
  `./mytool.config.js:3` set it to `4`"*. Structurally typed, **no import of burgee** (Y1).

  **Built 2026-09-15** as `src/validate.ts`, and the sentence in the requirement is a test.
  Getting the second half of it needed a line number, so `Provenance` gained an optional
  `line` (R3 asked for one and 0.1.0 had none) and `config.ts` records one per top-level key
  for JSON layers by scanning text — `JSON.parse` reports no positions, and a parser that did
  would be a parser. The scan is exact about what it can answer and silent about what it
  cannot, because a confident wrong line number is worse than none. `validate` returns **every**
  violation rather than the first, so a config with three mistakes is fixed in one pass.

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

## What is built

**This is the list PLAN 3.2's "Done when" reads.** One row per requirement, each with the
file that satisfies it and the check that would fail if it stopped being true. A row saying
`Not built` is the thing 3.2 is finished by removing; a row saying `Built` without a check is
a claim, so every row names one.

| R | Status | Where | The check |
| :-- | :-- | :-- | :-- |
| R1 | **Built** | `src/precedence.ts` — `ORDER`, and `RANK` derived from its positions | `precedence.test.ts`: the resolved candidate order **equals** `ORDER` |
| R2 | **Built** | `src/precedence.ts` — `resolve(specs, layers)`, no I/O | `precedence.test.ts`, 20 cases over pure layers |
| R3 | **Built** | `src/precedence.ts` — `provenance`, now with `line`; recorded by `config.ts`'s `lineOf` for JSON layers | `discovery.test.ts`: `discover` returns `lines: { region: 2, out: 3 }` |
| R4 | **Built** | `src/explain.ts` — `explanation()` is the record; `renderExplanation`, `explanationJson`, `explanationEvent` are its three renderings | `explain.test.ts`: `explain(…) === renderExplanation(explanation(…))`, byte for byte |
| R5 | **Built** | `src/search.ts` — 120 lines, bounded by `stopAt`, `WALK_LIMIT` and the root; real paths compared so a symlink ring ends the walk | `search.test.ts`, 10 cases incl. a link pointing back at its own ancestor |
| R6 | **Built** | `src/load.ts` — four builtin loaders, injected loaders for everything else, `LoaderError` (`exitCode: 2`) naming the extension and the option | `load.test.ts`, 11 cases; `NOT_BUNDLED` is asserted absent from `defaultLoaders` |
| R7 | **Built (0.1.0)** | `src/config.ts` — `loadWithExtends`, deep merge, cycle rejection | `config.test.ts` |
| R8 | **Built** | `src/cosmiconfig.ts` + `-defaults` + `-util` re-exported from the root; `./cosmiconfig`, `./dotenv`, `./find-up` as separate entry points | cosmiconfig's own suite: **186 / 241**. `shape.test.ts` locks the export map and subpath isolation |
| R9 | **Built** | `src/shape.test.ts` — a ceiling on the **built** `dist`, not on the source | `shape.test.ts`: 95,907 B against a 140,000 B ceiling, and a floor so an empty build cannot pass |
| R10 | **Not this package's to finish** | two of four suites vendored (`cosmiconfig`, `dotenv`); `lilconfig` unvendored, `rc` is PLAN 2.15 and the harness lane's | `npm run compat -- cosmiconfig --control`; see [§ The two suites, measured](#the-two-suites-measured) |
| R11 | **Built** | no source in the package names `process` | `shape.test.ts` locally, and `packages/burgee/src/process-reference-lock.test.ts` repo-wide — seniority has **no** allow-list entry, which is the claim |
| R12 | **Built** | `src/validate.ts` — `validate` returns every violation, `check` throws one `ConfigError` | `validate.test.ts`: ``` `out` must be a string; `./mytool.config.js:3` set it to `4` ``` |
| R13 | **Built (2026-09-14)** | `src/precedence.ts` — open union, `describe`'s `default` branch | `precedence.test.ts`: a `vault` source renders itself in `--explain` |
| R14 | **Built (2026-09-14), re-checked 2026-09-15** | `ORDER` is the one declaration; `Source` and `RANK` are derived | `precedence.test.ts` asserts all three agree. Nothing added in 3.2 writes a source kind: the new files touch `RANK` only through `plugin.ts`, which already did |
| R15 | **Built (2026-09-14)** | `src/plugin.ts` — the `sources` host | `plugin.test.ts` |

**R10 is the single row that is not built, and the reason is a file this lane may not write.**
`lilconfig` has not been vendored at all, and `rc` is assigned to the harness lane by the plan
(2.15) because it grades through exit codes rather than a suite. What *is* in this lane's gift
for R10 was done: both vendored hosts' numbers are now reproducible and stable, and the
blockers are down from five to two — see below.

### Where the 186 stops, exactly

Every one of the 55 cases `seniority` does not pass is accounted for, and neither cause is a
compatibility gap the design did not already declare:

| cause | cases | listed as |
| :-- | --: | :-- |
| no YAML parser — `import.test.ts` (22), `successful-directories` (10), `meta-config` (6), `successful-files` (6), `failed-directories` (4), `search-strategies` (4), `failed-files` (2) | **54** | R6, constraint 3 |
| `index.test.ts` imports `'../src/index.js'`, for which the vendor step writes no shim | **1** | finding 4, and it fails identically for the control |

That accounting is the point of the number. A 77.2% whose gap is *unexplained* would be a
worse result than a lower one whose gap is named, because the unexplained part is where a
compatibility claim quietly becomes false.

`loadYaml` here reads the JSON subset of YAML — every JSON document is a YAML document — and
refuses the rest with a `USAGE`-class error naming `loaders: { '.yaml': … }`. That is worth
**28 of the 54** on its own: `caches.test.ts`'s fixtures are extensionless files whose content
is strict JSON, and a `noExt` loader that refused everything would have cost them too.

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
  precedence.ts   ORDER, RANK, the pure resolver, values + provenance   (R1, R2, R3, R13, R14)
  explain.ts      the record and its three renderings; imports nothing  (R4)
  search.ts       the bounded upward walk, cycle-safe                   (R5, Y10)
  load.ts         four builtin loaders; injected loaders; USAGE refusal (R6)
  config.ts       discovery, extends, deep merge, per-key line numbers  (R3, R7)
  validate.ts     manifest-shaped validation, structurally typed        (R12)
  plugin.ts       the `sources` host — ORDER-ranked, read here          (R13–R15)
  cosmiconfig.ts           Explorer, ExplorerSync, cosmiconfig(), cosmiconfigSync()  (R8)
  cosmiconfig-defaults.ts  search places and loaders, as data                        (R8)
  cosmiconfig-util.ts      decodeFileContent, getPropertyByPath, mergeAll            (R8)
  dotenv.ts       dotenv 17's parse/populate/config                     (R8)
  find-up.ts      the override target over `search`                     (R8)
  schema.json     the family plugin schema, byte-identical       (plugin-contract R2)
  index.ts        seniority's own API + cosmiconfig's surface
  shape.test.ts   R8's export map, R9's ceiling, R11's process lock
```

**Two notes on the layout, because it is not the one written above it.** `order.ts`,
`resolve.ts` and `extends.ts` were never separated out: `ORDER`, `RANK` and `resolve` are 150
lines that read as one idea and splitting them would put the array one file away from the loop
that iterates it, which is the opposite of R1's point. And `runtime.ts` does not exist here —
PLAN 4.3's `Runtime` wave is a separate step, and until it lands R11 is satisfied by nothing
in the package naming the process at all, which is the stronger form.


**Order.** Extract `precedence.ts` → `order` + `resolve` + `explain` → `search` → `load` →
`extends` → `validate` → vendor the four suites → B4 rows and the discovery-chain row → the
override recipes, each behind its own pass rate.

**The truth table is the product.** `ORDER` as data means the conformance test enumerates the
combinations of the **five** sources — R14 retired the sixth, and with it the "2⁶ = 64" line
that used to stand here, which counted a distinction the resolver does not make — asserts the
winner in each, and the docs page is generated from the same array. That is what "precedence
is a declared truth table testable per rule 4" means concretely, and it is the thing no
incumbent can produce, because none of them has the order written down anywhere but in control
flow.

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
the host. **Re-measured 2026-09-15 under PLAN 3.2.** Both host rows are still **`planned`**,
not `active`, and both baseline fragments are therefore inert until someone activates them.
That is the honest state: a host whose control cannot be run, or runs below its own reference,
must not publish a rate.

| incumbent | release / tag / commit | files | control | target | target rate |
| :-- | :-- | --: | :-- | :-- | :-- |
| `dotenv` | 17.4.2 · `v17.4.2` · `f116f703` | 9 (7 gated, 2 internal-only) | **141 / 141 — 100.0%** | `seniority/dotenv` | **built, and ungradeable here** — see finding 1 |
| `cosmiconfig` | 10.0.1 · `v10.0.1` · `219805f4` | 11 (9 gated, 2 internal-only) | **240 / 241 — 99.6%** (was 210 / 241) | `seniority` | **186 / 241 — 77.2%** (was 3 / 241) |

Both cosmiconfig numbers were taken three times in a row and read the same each time. That
sentence is doing work — see finding 3.

`seniority/dotenv` exists now, so the old honest zero (`missingTarget` reported it rather than
running anything) no longer describes the row. It is replaced by a different honest answer:
the suite still cannot be run here at all, so **no rate is recorded**. A number would have to
be invented to fill that cell, and an invented number in a ratchet that only goes up is worse
than an empty one.

### Reproducing these numbers

- **cosmiconfig, control and target.** Install the three pinned packages into
  `packages/compat-oracle/vendor/cosmiconfig/node_modules` — they are declared in the host's
  `suiteDeps` and in the vendored `package.json`, so `npm install --no-package-lock --prefix
  packages/compat-oracle/vendor/cosmiconfig` is the whole step, and it touches neither the
  workspace manifest nor the root lockfile. Flip the host to `active` in `hosts.ts`,
  `npm run build -w compat-oracle`, then
  `node packages/compat-oracle/dist/bin.js cosmiconfig --control` for **240 / 241** and the
  same without `--control` for **186 / 241**. Both `restoreMocks`/`mockReset` and the
  30-second per-test timeout now live in the host's `vitestConfig`, so the generated config
  carries them and the hand step the 2026-09-14 recipe needed is gone.
- **The target rate needs nothing installed.** Verified by moving
  `vendor/cosmiconfig/node_modules` aside and running again: still 186 / 241. Only the
  *control* needs the incumbent, which is finding 2.
- **dotenv's 141 / 141.** One `node tests/<file>.js` per gated file from the vendored root
  with the outputs concatenated, then `summarize()` over the result — the loop finding 1
  describes, with `tap`, `sinon`, `decache` and `dotenv@17.4.2` installed beside the suite.
  The two counts that matter are countable by hand from the raw TAP: 141 lines matching
  `^ok`, none matching `^not ok`.

### What is blocking each row, and whose file it is

**Down from five findings to three, and two of the three are one line each.** The two that
closed, closed inside this lane's own files: `hosts.ts`'s `vitestConfig` now carries the
host's own `restoreMocks`/`mockReset` (old finding 3), and `suiteDeps` declares the three
packages the suite reaches for, out of tree (old finding 2). What is left:

1. **No `tap` runner arm** (`compat-oracle/src/run.ts`, harness). dotenv's suite is node-tap.
   Its files emit flat TAP that `summarize()` already reads correctly — measured:
   `node tests/test-parse.js` prints `ok 1 …` through `1..47` at column zero, exactly the
   dialect `parseFlatTap` counts. What is missing is the *invocation*. `node --test
   --test-reporter=tap` is not it: measured, it collapses that 47-case file to a single
   `ok 1 - tests/test-parse.js`, which would grade 141 cases as 7. The arm is one spawn per
   file with the outputs concatenated — per-file plan lines restart at `ok 1` and
   `parseFlatTap` counts lines, not numbers, so concatenation needs nothing else. The
   141 / 141 above was produced by exactly that loop.

   **Not a reason to hold `seniority/dotenv` back, and it did not.** The subpath is built and
   tested against dotenv 17.4.2's documented behaviour in `src/dotenv.test.ts`; what it does
   not have is a rate, and it will not get an invented one. Installing `tap` to obtain one
   costs **203 packages and 140 MB**, measured, which is not a trade this repository makes for
   a single row.

2. **`installSuiteDeps` checks that a name resolves, not that the pinned version is the one
   installed** (`compat-oracle/src/run.ts`, harness). This is the one blocker keeping
   `cosmiconfig` out of `active`, and it is new — it could not be seen until `suiteDeps` was
   declared for a package the workspace already hoists.

   `installSuiteDeps` skips any package that `resolvesFrom` the vendored directory. This
   workspace hoists `cosmiconfig` at **9.0.2** (through `@commitlint/load`) and
   `parent-module` at **1.0.1** against the `3.x` the suite is written for. Both resolve, so
   the pinned install never runs, the 10.0.1 suite is graded against 9.0.2, and the control
   reads **234 / 241** — seven failures against an allowance of one. Measured both ways on
   2026-09-15: with the pins installed, 240 / 241 three times; with
   `vendor/cosmiconfig/node_modules` removed, 234 / 241.

   A control below its own reference must not publish a rate, so the host stays `planned`.
   The fix is to compare the installed `package.json`'s `version` against the pin and install
   when it differs — the same "the hoist is not the pin" lesson `hosts.ts`'s own `suiteDeps`
   comment already records about a caret, one step further along.

3. **A published rate must not read the machine it ran on** (this lane's, and **fixed here** —
   recorded because the shape will recur). Three oracle runs of the *unchanged control* read
   240, 238 and 231 while other work ran on the same laptop, and a direct `vitest run` over
   the same nine files read 240 / 240 every time. The cause is vitest's 5-second default
   per test against cases that walk and stat a temp tree: under load, some of them cross it.
   `vitestConfig` now sets `testTimeout`/`hookTimeout` to 30 s, and the three-run spread is
   gone. This is the same class as the ambient-colour finding already recorded in `run.ts` —
   a number that was reading the operator — and it is worth saying out loud that the first
   version of this step's result, 170 / 241, was that artefact and not a measurement.

4. **An internal shim cannot resolve into a tarball that ships no source**
   (`writeInternalShims` in `run.ts`, harness). **Decided here, as 3.2's own text said it must
   be.** `index.test.ts` imports `'../src/index.js'` — cosmiconfig's public entry, reached by
   an internal path — in addition to the public entry, and `vi.mock`s `../src/Explorer` and
   `../src/ExplorerSync` to assert the constructor arguments the entry passes them. The vendor
   step writes a shim for every internal specifier the suite names, but not for a *public*
   entry named internally, so the file fails to load.

   It fails identically for the control and for the target, which is what settles it: it is the
   harness's file-layout assumption, not a property of either implementation. It is recorded as
   `controlFailures: { count: 1, why: … }` on the host, so the control's 240 is a named 240
   rather than an unexplained one, and the real fix — teaching the shim discovery in
   `vendor.ts` about this shape — is the harness lane's.

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

- `npm test -w seniority` — **126 cases across 11 files** (49 before 3.2). The truth table
  over `ORDER` (five kinds, not six: R14), the record and its three renderings (R4), the
  bounded walk against a symlink cycle (R5), the loader refusal and the five formats
  deliberately not bundled (R6), the provenance sentence with its line number (R12), the
  dotenv grammar (R8), and `shape.test.ts` for R8's export map, R9's ceiling and R11's
  process lock. `src/plugin.test.ts` for R13–R15 is unchanged.
- `npm test -w burgee` — the shared vectors, unchanged.
- **`npx eslint . --max-warnings 0`** — a **separate CI job** from `npm run ci:local`, which
  does not include lint. Worth stating in the design because it is where this step's
  avoidable failures come from.
- `npm run compat -- cosmiconfig lilconfig dotenv rc` — four rows, `--control` first,
  ratcheting. Two vendored, neither `active`, and the command refuses a planned host by name
  (`✖ not an active host: cosmiconfig, dotenv`). Reproduce today's numbers with the recipes in
  [§ Reproducing these numbers](#reproducing-these-numbers).
- `npm run bench -- --foundation` — the discovery-chain row: `cosmiconfig` + its six
  transitive helpers against this package, on installed bytes and on resolve latency.
- **The check that would have caught the original problem.** The original problem is a value
  whose origin nobody can name: `out` is `lib` and four sources could have set it. The check
  is a fixture with **every source setting the same key at once**, asserting both the winner
  and that `explain` names the exact file and line of each loser. It fails against every
  incumbent — none can produce the record at all — and that failure is checked in as the
  control, so the check is known to work rather than assumed to.

### What a reader should distrust here

Three numbers in this document are softer than they look, said plainly rather than left to be
discovered:

- **77.2% is one incumbent's suite, not "compatibility".** It is cosmiconfig 10.0.1 on a
  Mac. `lilconfig` and `rc` have never been run against this package at all, and dotenv's
  suite cannot be run here.
- **The 140 kB ceiling is a bound on growth, not a comparison.** Nothing in this repository
  has yet measured seniority against `lilconfig` on installed bytes or on spawn delta, which
  is what R9 actually asks for; that is the `bench --axis weight` row and it has not run.
- **R3, R4 and R12 remain a hypothesis about adopters.** Provenance and `--explain` are the
  differentiator and no incumbent has them — but "no incumbent has it" is evidence about the
  ecosystem, not about demand. The Evidence table has said so since this design was written
  and 3.2 does not change it.

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
