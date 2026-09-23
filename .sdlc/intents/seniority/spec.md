# Design — seniority

Intent: [`intent.md`](./intent.md). Umbrella:
[`cli-foundation-stack`](../cli-foundation-stack/spec.md). **Status:** approved (2026-09-23, under the owner's delegation, D-129).

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

  **The subpaths, and D-006 is why there are now five.** `./cosmiconfig`, `./dotenv`,
  `./lilconfig`, `./rc` and `./find-up` are separate entry points with separate files, locked
  by `shape.test.ts` — a program overriding `dotenv` must not thereby acquire the cosmiconfig
  façade, because the two are graded separately and a shared entry would make one suite's rate
  depend on the other's module graph.

  `./lilconfig` and `./rc` were added 2026-09-20 and the lilconfig row is the cleanest possible
  demonstration of D-006: **0 / 77 → 67 / 77 with no change to any existing file**, because the
  suite had been pointed at the package *root*, which presents cosmiconfig's surface and has no
  `lilconfigSync` in it. The zero was seventy-seven copies of one `TypeError`. It could not have
  been fixed by widening the root either, and that is the part worth keeping: lilconfig's last
  case reads `Object.keys()` of the module it is given, drops the four factory names and
  `metaSearchPlaces`, and compares what is left against the real cosmiconfig's — so a module
  exporting both surfaces fails it *by construction*. `seniority/lilconfig` therefore publishes
  four runtime names and no more, and `lilconfig.test.ts` locks that, because adding an export
  is the least alarming edit anyone could make to it.

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
  was done — see [§ The four suites, measured](#the-four-suites-measured) for every number and
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

**The Status cell holds two words and nothing else**, `Built` or `Not built`, because
`scripts/plan-progress.ts` reads it. Four of these rows used to spell it `Built (0.1.0)` or
`Built (2026-09-14)` and the checker — which matches `**Built**` — counted them as unrecorded,
so R7, R13, R14 and R15 read as missing while the table plainly said otherwise. Two shapes for
one fact is the drift this repository is about; two spellings of one word inside one table is
the same drift, smaller. The version and the date belong in *Where*, which is where they now
are.

| R | Status | Where | The check |
| :-- | :-- | :-- | :-- |
| R1 | **Built** | `src/precedence.ts` — `ORDER`, and `RANK` derived from its positions | `precedence.test.ts`: the resolved candidate order **equals** `ORDER` |
| R2 | **Built** | `src/precedence.ts` — `resolve(specs, layers)`, no I/O | `precedence.test.ts`, 20 cases over pure layers |
| R3 | **Built** | `src/precedence.ts` — `provenance`, now with `line`; recorded by `config.ts`'s `lineOf` for JSON layers | `discovery.test.ts`: `discover` returns `lines: { region: 2, out: 3 }` |
| R4 | **Built** | `src/explain.ts` — `explanation()` is the record; `renderExplanation`, `explanationJson`, `explanationEvent` are its three renderings | `explain.test.ts`: `explain(…) === renderExplanation(explanation(…))`, byte for byte |
| R5 | **Built** | `src/search.ts` — 120 lines, bounded by `stopAt`, `WALK_LIMIT` and the root; real paths compared so a symlink ring ends the walk | `search.test.ts`, 10 cases incl. a link pointing back at its own ancestor |
| R6 | **Built** | `src/load.ts` — four builtin loaders, injected loaders for everything else, `LoaderError` (`exitCode: 2`) naming the extension and the option | `load.test.ts`, 11 cases; `NOT_BUNDLED` is asserted absent from `defaultLoaders` |
| R7 | **Built** | shipped 0.1.0. `src/config.ts` — `loadWithExtends`, deep merge, cycle rejection | `config.test.ts` |
| R8 | **Built** | `src/cosmiconfig.ts` + `-defaults` + `-util` re-exported from the root; `./cosmiconfig`, `./dotenv`, `./lilconfig`, `./rc`, `./find-up` as separate entry points | the incumbents' own suites: cosmiconfig **186 / 243**, dotenv **80 / 141**, lilconfig **67 / 77**, rc **0 / 1**. `shape.test.ts` locks the export map and subpath isolation |
| R9 | **Built** | `src/shape.test.ts` — a ceiling on the **built** `dist`, not on the source | `shape.test.ts`: 95,907 B against a 140,000 B ceiling, and a floor so an empty build cannot pass |
| R10 | **Built** | all four vendored and graded control-first, re-measured 2026-09-20: `cosmiconfig` **186 / 243, 76.5%**, `dotenv` **80 / 141, 56.7%**, `lilconfig` **67 / 77, 87.0%**, `rc` **0 / 1** (measured, not a placeholder) | `npm run compat -- cosmiconfig --control`, and the same for the other three; see [§ The four suites, measured](#the-four-suites-measured) |
| R11 | **Built — restated by D-135** | the resolver names `process` nowhere; the one file that does is `src/runtime.ts`, the family's Y9 seam, which only the dotenv and rc drop-ins open and only as a default when the caller passed no world. Before 2026-09-23 the claim was *no source names `process` at all*, and it cost 34 dotenv cases and rc's one: their incumbents read the process by default and their suites assert it | `shape.test.ts` locally; `packages/burgee/src/process-reference-lock.test.ts` repo-wide, where `seniority/src/runtime.ts` is now the one allow-listed entry |
| R12 | **Built** | `src/validate.ts` — `validate` returns every violation, `check` throws one `ConfigError` | `validate.test.ts`: ``` `out` must be a string; `./mytool.config.js:3` set it to `4` ``` |
| R13 | **Built** | 2026-09-14. `src/precedence.ts` — open union, `describe`'s `default` branch | `precedence.test.ts`: a `vault` source renders itself in `--explain` |
| R14 | **Built** | 2026-09-14, re-checked 2026-09-15. `ORDER` is the one declaration; `Source` and `RANK` are derived | `precedence.test.ts` asserts all three agree. Nothing added in 3.2 writes a source kind: the new files touch `RANK` only through `plugin.ts`, which already did |
| R15 | **Built** | 2026-09-14. `src/plugin.ts` — the `sources` host; `src/schema.json` describes the key since 2026-09-23 (see below) | `plugin.test.ts` |

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

## The four suites, measured

`cosmiconfig` and `dotenv` vendored 2026-09-14 by `npx tsx scripts/vendor-suite.ts <pkg>
--verify`, each at the annotated tag matching its published release, each `PROVENANCE`
stamped `verified` against the host; `lilconfig` and `rc` followed on 2026-09-16.

**All four are `active` as of 2026-09-16**, and what activated them was three harness fixes
rather than anything about this package — recorded here because the paragraph this replaces
said the opposite for two days and the reason matters more than the status:

| host | target | control | what had been blocking it |
| :-- | --: | --: | :-- |
| `cosmiconfig` | **186 / 243, 76.5%** | 240 / 243 (allowance 1) | `installSuiteDeps` skipped a pin it could resolve *by name*, so the 10.0.1 suite graded against the workspace's hoisted 9.0.2 and the control read 234 / 241 — below its own reference, which must not publish a rate |
| `dotenv` | **74 / 141, 50.3%** → **80 / 141, 56.7%** | 141 / 141 | its suite is node-tap and `command()` had no `tap` arm, so it fell through to mocha's and graded zero |
| `lilconfig` | **0 / 77** → **67 / 77, 87.0%** | 67 / 77 (allowance 10) | `jest.clearAllMocks` was unmapped, and it is called in a top-level `beforeEach` — a TypeError before every case, control 0 / 84 |
| `rc` | **0 / 1**, `target not built yet` → **0 / 1**, measured | 1 / 1 by exit code | nothing, in the end: its control had been *passing* by resolving `rc` out of a stray `/Users/…/node_modules`, which the same pin fix closed |

**The rate moved down when it became honest.** `cosmiconfig`'s reference is now **243, not
241**: two cases sit behind `if (process.platform === 'linux')` in
`search-strategies.test.ts`, so a darwin run never registers them, and the published rate was
dividing by whichever machine last generated it. They are counted **against us** rather than
excluded, because we genuinely fail them — this package derives its global config directory
from `os.homedir()` instead of reading `XDG_CONFIG_HOME` through `env-paths`, which is R11's
listed divergence. Excluding them would have moved the number up, 76.5% → 77.2%, by dropping
two cases we lose.

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

### The four ceilings, named — 2026-09-20

Every case the four suites do not give us is accounted for below, and **none of the four gaps
is an unfound bug**. That matters more than the rates: a percentage whose remainder is
unexplained is where a compatibility claim quietly becomes false.

| host | today | ceiling reachable here | what the rest is | whose call |
| :-- | --: | --: | :-- | :-- |
| `cosmiconfig` | 186 / 243 | **187** | 54 YAML · 1 harness shim · 2 linux XDG | constraint 3 (owner) |
| `dotenv` | 80 / 141 | **80 — reached** | 27 `.env.vault` / `DOTENV_KEY` · 34 ambient `process.env` | scope + R11 |
| `lilconfig` | 67 / 77 | **67 — reached** | 10 `jest.mock('fs')` under vitest | declared blind spot |
| `rc` | 0 / 1 | **0** | 1 ambient `process.env` | R11 |

**cosmiconfig — 54 of the 55, and it is measured now rather than read off the fixtures.**
Every failing entry in the raw TAP was matched against its diagnostic: 54 carry
`no YAML parser` — the `LoaderError` `loadYaml` throws — and the 55th is `index.test.ts`, the
one-case harness allowance `controlFailures` already declares. So there is no behavioural
divergence hiding inside the number and no route past it that is not `js-yaml` or a parser
written to replace it. The largest single block is the whole of `import.test.ts`, 22 cases:
`$import` **is built and works**, and every one of its fixtures is `.yml`, so the suite cannot
see the feature. Lifting this is constraint 3 — 747 M/wk of format parsers deliberately not
taken — which is a decision about what the package refuses to be, and therefore the owner's.

**dotenv — 61 short, in two blocks and no third.** 26 cases in `test-config-vault.js` plus 1
in `test-decrypt.js` are `DOTENV_KEY` and the `.env.vault` format, which dotenv itself
deprecated in favour of dotenvx and this package declines. The other 34 — 31 of
`test-config.js`'s 32 and all 3 of `test-config-cli.js` — need `config()` to default
`processEnv` to `process.env` and `path` to a cwd-relative `.env`. Read the case list and
every one of them asserts `process.env.BASIC` after a bare `config()`. The one case in that
file that hands `config` an object of its own, `can write to a different object rather than
process.env`, passes.

**rc — one assertion, and its line number.** `node test/test.js` in the vendored directory
against the built façade fails at `test.js:14`, `assert.equal(config.envOption, 42)`, *having
already passed line 13*. rc's signature is `rc(name, defaults, argv, parse)`: argv is a
parameter and the environment is not. `packages/seniority/src/rc.test.ts` is that same file,
case for case, with the environment supplied as an argument — and it passes. The distance
between 0 / 1 and 1 / 1 is therefore one allow-list entry in
`packages/burgee/src/process-reference-lock.test.ts`, not one line of rc semantics.

### R11 is true by its own wording and weaker than it reads

Worth writing down because this lane kept running into it. The claim is "nothing reads
`process.*`", the repo-wide lock enforces exactly that pattern, and seniority passes it with no
allow-list entry. But `cosmiconfig.ts` has read the working directory since it was written —
`resolvePath(filepath)`, `resolvePath(from)` and `resolvePath('')`, one-argument `path.resolve`,
which resolves against the live cwd — and `lilconfig.ts` now does the same for
`search(searchFrom = …)` and `load()`'s relative paths, because its incumbent's suite hands it
paths relative to the cwd. That is the working directory by a different spelling. It is not a
dodge (a façade must absolutise a relative path somehow, and `node:path` is the only tool that
does it) but the honest statement of R11 is **"nothing in this package reads the *environment*
or *argv*, and the working directory enters only through `node:path`"** — not the stronger
thing a reader takes from the lock passing. The three things that genuinely have no route in
are `env`, `argv`, and `exit`, and those are the three the façades keep colliding with.

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

## Every feature seniority offers

Eight entry points. A consumer needs nothing else installed, and needs nothing else from
this family — `resolve` and `explain` are structurally typed over shapes the caller owns, so
there is no burgee import anywhere in the package (Y1).

**`seniority` — the root.** The product, in five groups.

| Group | Exports | What it answers |
| :-- | :-- | :-- |
| Precedence | `resolve(specs, layers)`, `ORDER`, `RANK` | every declared option resolved from flags, env, config, package and defaults — with the order as **data**, not as control flow |
| Provenance | `resolve(…).provenance` | for **every** key, always and not behind a flag: which source won, the file or variable it came from, and the line |
| Explanation | `explanation(name, res)`, `explain(name, res)`, `explanationJson(e)`, `explanationEvent(e)` | the winner *and everything it beat*, as one record with three renderings: human text, `--json`, an agent event. `explain` is literally `renderExplanation(explanation(…))`, asserted byte for byte |
| Discovery | `discover(d)`, `candidates(d)`, `loadWithExtends(path)`, `deepMerge(a, b)`, `lineOf` | find a config file, follow its `extends` chain, merge it — and say which paths were *going* to be tried and why |
| Env | `envName(name, spec, prefix)`, `envBoolean(raw)`, `screaming(name)` | the variable an option reads, and the boolean spellings that count |
| Loading | `loadPath`, `loaderFor`, `defaultLoaders` (as `builtinLoaders`), `NOT_BUNDLED`, `LoaderError` | four builtin loaders (`.json`, `.js`, `.mjs`, `.cjs`); everything else is the caller's to inject |
| Search | `search(names, opts)`, `searchAll(names, opts)`, `WALK_LIMIT` | the bounded upward walk: `stopAt`, a 64-directory limit, real-path comparison so a symlink ring ends it |
| Validation | `validate(shape, res)`, `check(shape, res)`, `ConfigError` | every violation at once, each naming the file, the line and the value — *"`out` must be a string; `./mytool.config.js:3` set it to `4`"* |

**The subpaths.** Each is a separate file with its own module graph, locked by
`shape.test.ts`, because each is graded separately and a shared entry would make one suite's
rate depend on another's.

| Subpath | Replaces | Standing |
| :-- | :-- | :-- |
| `seniority/cosmiconfig` | `cosmiconfig` | **186 / 241** on the host's own suite, control 240 / 241. The full surface: both explorers, three search strategies, two caches, `$import`, the meta-config merge, the error strings verbatim |
| `seniority/dotenv` | `dotenv` | `parse` and `populate` are dotenv 17.4.2's, its line grammar reproduced character for character. Control **141 / 141**, ungradeable here for want of a `tap` runner. One divergence: `config()` takes `processEnv` rather than reaching for the ambient environment (R11) |
| `seniority/find-up` | `find-up` → `locate-path` → `p-locate` → `path-exists` | the upward walk as a callable, so the override resolves |
| `seniority/precedence` | — | `resolve`, `ORDER`, `RANK` alone, for a caller that wants the resolver and none of the discovery |
| `seniority/config` | — | discovery and `extends` alone |
| `seniority/plugin` | — | the `sources` host — see below |
| `seniority/schema.json` | — | the family's plugin schema as data, because `E_PLUGIN_SCHEMA`'s `fix` names that specifier and an error whose advice does not resolve is worse than no advice |

Three properties hold across all of it:

- **Zero external dependencies.** `cosmiconfig` + `dotenv` + `rc` + `find-up` is 809 M/wk of
  upward-walk alone; this is one package with no tree.
- **Nothing reads `process`.** `env`, `cwd` and `argv` arrive as arguments (R11); seniority has
  **no entry at all** on `packages/burgee/src/process-reference-lock.test.ts`'s allow-list.
- **`resolve` is pure**, which is what makes `explain` worth trusting: the explanation is
  computed from the same layers the answer was, not reconstructed afterwards.

## Extending seniority — the `sources` key

seniority hosts `sources` (`plugin-contract` R1, R5a, R6, R7, R8). `src/plugin.ts` is the
whole contract and `src/plugin.test.ts` is what holds it; this section is that file read back
as documentation, because a consumer should not have to read an implementation to learn what
they are allowed to contribute.

**What a plugin is.** One plain object, shared by the whole family. seniority reads exactly
three fields and **ignores every other key without complaining** — a plugin written for
flagstaff registers here, contributes nothing, and that is not an error. It is what makes one
object work against whatever subset of the family is installed.

```ts
import { register, sources } from 'seniority/plugin';
import { resolve } from 'seniority';

register({
  name: 'acme-vault',          // required, non-empty; how a refused source is reported
  contract: 1,                 // optional; a host refuses a contract newer than it knows
  sources: {
    vault: {
      rank: 15,                // strictly between RANK.flag and RANK.default
      read: ({ env, cwd }) => ({ values: { token: '…' }, location: 'vault://acme/prod' }),
    },
    ci: { rank: 25, values: { colour: false }, location: 'the CI image' },  // the static form
  },
});

const resolved = resolve(specs, { flags, env, files, sources: sources({ env, cwd }) });
```

**What a plugin may contribute.** One thing: a named resolution source, which `--explain`
will then print by that name.

| Field | Required | Contract |
| :-- | :-- | :-- |
| `rank` | yes | an **integer, strictly** between `RANK.flag` and `RANK.default` |
| `values` | exactly one of these two | a plain object of option name → value: the **static** form, readable without being run |
| `read(runtime)` | exactly one of these two | `(runtime) => { values, location? } \| undefined`: the **dynamic** form, for a vault or a remote config that has to go and look |
| `location` | no | a string — the file, URL or variable set a person would go and open. Falls back to `read`'s own `location`, then to the source's name |

**What is validated, and by what.** By `validate()` in `src/plugin.ts`, called from
`register()` — at the door, before the plugin is kept. It is a hand-written walk rather than
a schema pass, and that is worth stating plainly because the obvious assumption is wrong:

> **`schema.json` does not describe `sources`.** All seven hosts ship a byte-identical copy of
> the family schema (`scripts/plugin-schema-lock.test.ts` enforces the identity), and that file
> describes `name`, `contract`, `tokens`, `glyphs`, `spinners`, `borders`, `components` and
> `capabilities` — flagstaff's keys and paratext's. `sources` passes it only because the schema
> sets `additionalProperties: true`. So `plugin.ts` is the truth for this key, and the schema is
> the truth for the envelope around it. caique records the same gap for `widgets`, for the same
> reason: describing the key properly means editing the source copy in flagstaff and
> propagating it to all seven, which is one cross-package edit and not this lane's.
>
> **Resolved 2026-09-23:** the family schema now describes `resolvers`, `widgets`, `handlers`, `sources`, `commands`, `hooks` and `enforce`. flagstaff, the one host that validated against the whole file, validates against its own slice (`plugin.schema.json`), so no host enforces another's keys; `plugin-schema-lock.test.ts` has no allow-list left, and `plugin-schema-agreement.test.ts` holds each definition to its host's verdict.
>
> The lock that would catch this does not exist. It asserts the seven copies are identical and
> that each host exports the subpath its error message names; it never asserts that a host's
> schema describes the key that host validates. A lock on *identity* passes on seven identical
> copies of a file that is wrong.

The checks, each with the code it throws and the `fix` it carries:

| Refused | Code | Because |
| :-- | :-- | :-- |
| a non-object, or an array, or a function | `E_PLUGIN_SCHEMA` | a plugin is data |
| a missing or empty `name` | `E_PLUGIN_SCHEMA` | the name is how a refused source is reported; without it the error cannot say whose |
| `contract` newer than `1`, or not an integer | `E_PLUGIN_CONTRACT` | a host refuses what it does not understand rather than half-reading it |
| `sources` that is not an object | `E_PLUGIN_SCHEMA` | |
| a source that is not an object | `E_PLUGIN_SCHEMA` | |
| `rank` not an integer, `<= RANK.flag`, or `>= RANK.default` | `E_PLUGIN_SCHEMA` | see below — this one is the decision |
| **both** `values` and `read`, or **neither** | `E_PLUGIN_SCHEMA` | one source gives one answer |
| `values` not an object, `read` not a function, `location` not a string | `E_PLUGIN_SCHEMA` | |

**A plugin adds a source; it cannot reorder the five.** `rank` slots a source *between* two
built-ins and does nothing else. Below `RANK.flag`, so what the user typed on the command line
always wins; above `RANK.default`, so a declared default stays the floor. Both bounds are
**refused at the door rather than clamped**, because a source silently demoted to last looks
like it worked and its author then debugs the wrong thing. "The order is not configurable" —
which the README states as a promise — survives extension exactly this far and no further.

**Reading happens in `plugin.ts`, never in `resolve`.** `sources(runtime)` calls each `read`
with the caller's own `{ env, cwd }` and returns plain `SourceLayer[]`; `resolve` receives
data. That is what keeps `resolve` pure (R2) and keeps the package off the process allow-list
(R11) — the two properties that make `--explain` worth trusting, and they would both be lost
if a plugin's `read` ran inside the resolver.

**`undefined` from a `read` contributes no candidate at all**, rather than an empty one.
`--explain` must not list a vault that was never reachable as a source that was consulted and
lost; those are different answers and telling them apart is what `--explain` is for.

**Later wins at an equal rank**, like ESLint flat config: the registry is an ordered array, and
the last word on a source name is the one nearest the program. `registered()` returns it in
that order; `reset()` empties it, for tests and for a program that re-registers at runtime.

**The type does not stand in the way.** `Source` is an open union —
`'flag' | 'env' | 'config' | 'package' | 'default' | (string & {})` — widened at 0.2.0
specifically so that hosting this key was an additive change rather than a breaking one
written as an additive one (R13, PLAN D5). `describe()`'s `default` branch renders an unknown
source as `` `${c.source} ${c.location}`.trim() ``, so **a plugin source explains itself in
`--explain` without seniority knowing its name**. That is the whole reason the widening came
first.

## What seniority deliberately does not do

Each with the reason. A consumer deciding whether this package is enough needs the boundary
as much as the list.

| Not here | Why | What to do instead |
| :-- | :-- | :-- |
| Bundle a YAML, TOML, INI or JSON5 parser | `js-yaml` 264 M + `json5` 205 M + `yaml` 176 M + `ini` 102 M is **747 M/wk** of parser this package refuses to put in anyone's tree for a format most programs do not use. It is also the single largest cause of the cosmiconfig gap — 54 of the 55 — and that is the honest price | inject it: `loaders: { '.yaml': parse }`. An unknown extension raises `LoaderError`, a **usage** error naming the option that would supply one |
| Read `process.env`, `process.cwd()` or `process.argv` | An ambient read makes every answer depend on where it was called, and it defeats `--explain`: a provenance record that cannot be reproduced from its inputs is a story, not a record | pass `{ env, cwd }`. `seniority/dotenv`'s `config()` takes `processEnv` and **refuses rather than guessing** when it is absent |
| Let a plugin reorder the five built-in sources | The precedence is the product. A program whose flag can be beaten by a config file is a program whose `--explain` output is the only way to know what it did, which is the failure this package exists to end | contribute a source with a `rank` between the two bounds |
| Let a plugin replace a built-in source | Same reason, from the other side: `flag` and `default` are the two ends a caller reasons from | — |
| Parse the command line | Where a flag *came from* is this package's question; what the tokens mean is the parser's, and the two have different compatibility targets | `burgee` |
| Print anything | `explanation()` is a record and `renderExplanation` is one rendering of it. A package that owned the output would own the colour and the terminal detection too, which are two other packages' jobs | `roundel`, `flagstaff` |
| Import burgee, or any sibling | The resolved shape is described **structurally** (R12/Y1). A config library that imports a CLI framework is a config library only that framework's users can have | the `Shape` interface — any object with those fields |
| Cache discovery across processes | A config file read from a stale cache is the worst shape of this bug: correct output, wrong input, no error. The two caches that exist are cosmiconfig's own, inside the façade, because its suite grades them | — |
| Vendor `lilconfig` and `rc` (R10) | `rc` grades through exit codes rather than a suite and PLAN 2.15 assigns it to the harness lane; `lilconfig` is unvendored. Both are writes under `packages/compat-oracle/**`, which is not this lane's path | **Done 2026-09-16 by the harness lane**, which is exactly where it was handed off to. R10 is `Built` and PLAN 3.2 is green |

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
