# Intent — seniority: which source outranks the others, and which one actually set this value. The config layer as a declared truth table with provenance

> Stage 1 artifact. Child of [`cli-foundation-stack`](../cli-foundation-stack/intent.md),
> requirements Y2, Y3, Y5, Y6, Y7, Y8, Y10, Y12. Peer of
> [`commander-env`](../commander-env/intent.md), which is the same logic **inside** the
> engine. **A standalone product**: its competitors are `cosmiconfig`, `lilconfig`, `rc`
> and `dotenv`, and it is useful with nothing else installed.

**Status:** approved (2026-09-23, under the owner's delegation, D-129) · **Opened:** 2026-09-09 · **Owner:** @ofri-peretz · **Name published:** `seniority@0.0.1`, 2026-09-09

> **Umbrella sweep 2026-10-26: criteria 1, 2, 3 and 5 held on `main` and in `seniority@1.1.1`.
> Criterion 4 is gated on `main` but not published.** `packageLayer` is already in the
> published tarball, so this intent no longer waits on the minor. It waits on
> `/docs/benchmarks`, which still prints the measurement of 2026-10-19. See
> [§ Umbrella sweep 2026-10-26](#umbrella-sweep-2026-10-26).

---

## What is wanted

*Seniority* is which one outranks the others — a plain English word rather than an idiom, so
it survives translation. Most of npm does not read English first.

A CLI option can arrive from four places. Resolving `--out`:

```text
~/.mytoolrc            { "verbose": false, "out": "dist" }    ← home file
./mytool.config.js     { out: "build" }                       ← project file
MYTOOL_OUT=tmp                                                ← environment
$ mytool build --out=lib                                      ← flag

resolved   out     = "lib"     flag > env > project > home > default
           verbose = false     only the home file set it
```

One function, plus the one thing nothing in the ecosystem offers:

| Export | Gives you | Replaces |
| :-- | :-- | :-- |
| `resolve(spec, { cwd, env, argv })` | the resolved values | `cosmiconfig`, `lilconfig`, `rc`, `c12` |
| `.provenance` | **which source set each value, and where** — file, line, env var, or flag | *nothing in the ecosystem* |
| `.explain(key)` | the winner and every candidate it beat | *nothing in the ecosystem* |
| discovery | the upward walk, ~30 lines, inside the package | `find-up`, `locate-path`, `p-locate`, `path-exists`, `resolve-from`, `import-fresh`, `parse-json` |

Sixteen incumbents, **1.81 B weekly downloads**. The claim that falls out is one sentence:
*cosmiconfig + find-up + locate-path + p-locate + path-exists + import-fresh + parse-json is
seven packages; this is one, with none.*

## Why now

- **The largest layer in the foundation, and the stalest field in it.** `resolve-from`:
  214 M/wk, last published **2019-04-15**. `path-exists`: 204 M/wk, **2021-08-12**. `rc`:
  30 M/wk, **2018-05-26**.
- **One chain is the argument in four packages.** `find-up` → `locate-path` → `p-locate` →
  `path-exists`: **809 M weekly downloads** to answer *"is there a file called X in this
  directory or any above it."* On Node 24 that is a loop and `fs.existsSync`.
- **It is a direct instance of the thesis, not an adjacent layer.** A config file is another
  surface of the same manifest that already produces help, `--json`, `--schema`, completions
  and MCP. Three consequences no incumbent can offer, because none of them has a manifest:
  precedence becomes a **declared truth table** testable per rule 4 instead of per-tool
  folklore; the config file **validates against the schema burgee already emits**, nearly
  free; and **provenance is answerable** — if `out` is `lib`, nothing in the ecosystem today
  can tell you which of four sources set it.
- **The core already exists and ships.** `packages/burgee/src/precedence.ts` is 153 lines of
  pure `resolve(specs, layers) → { values, provenance }`, built for `commander-env` and
  green in wave 3. This is the cheapest of the four packages to start, which is why the
  umbrella records the criterion for pulling it forward.
- **Somebody else is moving here now.** `config-layers` was first published **2026-09-08**,
  the same day this layer was measured. Re-check before committing (Y7's sibling discipline).

## Affected users and systems

- `packages/seniority` gains a real implementation; its README, docs section and benchmark
  page compete against `cosmiconfig` and `lilconfig` directly (Y12).
- **`packages/burgee` keeps `precedence.ts` and gains no dependency** (Y1). The two share a
  test-vector file — the `roundel`/`burgee` contrast-vector precedent — so a divergence in
  the truth table fails both suites at once.
- `commander-env`'s `--explain` gains a library form: the same record, exported, for CLIs
  not built on burgee at all.
- `compat-oracle` vendors `cosmiconfig`, `lilconfig`, `dotenv` and `rc`. Four new rows.
- `cli-benchmarks` B4 gains the seven-package discovery-chain comparison, which is this
  package's headline number.

## Constraints

1. **Precedence is declared data, never code.** One table — flag > env > project file >
   home file > package.json field > default — expressed as a value the package exports, so a
   caller can read it, a test can enumerate it, and a doc page can be generated from it.
   Departing from it requires editing the table, which is a reviewable diff.
2. **Provenance is not optional and not a debug mode.** Every resolved value carries its
   source. An agent repairing a misconfiguration needs the origin, not just the value; a
   value without one is the failure this package exists to remove.
3. **The format parsers stay out.** YAML, JSON5, TOML and INI are a different family under
   rule 10, maintained on a spec's cadence. `seniority` accepts a loader function per
   extension; it does not become a parser vendor. JSON and JS/TS module loading are builtin
   and therefore in.
4. **The discovery plumbing becomes ~30 lines inside the package, and is never a product.**
   File discovery is not CLI-specific — bundlers, linters and test runners use it too — so
   owning `find-up` as a package would mean serving audiences we have no edge with. It stays
   a quotable statistic.
5. **The upward walk is bounded (Y10):** a maximum depth and a stop at the filesystem root
   or a declared boundary, so a symlink cycle or a deep monorepo cannot hang resolution.
6. **Default export matches `cosmiconfig`'s exactly** for the override recipe (Y3), with
   `./dotenv` and `./rc` as separately graded compatibility subpaths.
7. Zero external dependencies, ESM with a `default` condition, Node ≥ 24 (U6, K2). Nothing
   reads `process.*` — `env`, `cwd` and `argv` are arguments (Y9).

## Success criteria

- Four vendored suites graded, `--control` first, four pass rates published and ratcheting.
- **The precedence truth table published as a generated page**, produced from the exported
  table, with one row per source combination — the artifact ten of ten surveyed CLIs lack
  (three document their order at all).
- `explain(key)` naming the file **and line** for a value set in a config file, proven on a
  fixture with all four sources set at once.
- Benchmark rows under `lilconfig` (0 deps, the lightest in the layer) on bytes and spawn
  delta, and the seven-package discovery-chain row published.
- The shared truth-table vectors green in both `burgee` and `seniority` suites.

## Umbrella sweep 2026-10-26

Read on `main` at `3d079b15` and against the published tarball `seniority@1.1.1` (`npm view
seniority version` reads 1.1.1, the same as the manifest). The section below, from earlier the
same day, is kept as written. Two of its statements have moved since:

- **"Stays `approved` until the seniority minor that ships `packageLayer` is on npm" is
  superseded.** Version PR #1253 published `seniority@1.1.1` as a patch, but it was built from a
  `main` that already carried #1264. The release window held back the minor changeset
  (`.changeset/seniority-package-field-lines.md` is still on `main`, with its `burgee: patch` half
  removed), and it did not hold back the code. The published `dist/config.js` exports
  `packageLayer(path, name, manifest)` with its `linesOf` line scan, and `lineOf` reads the top
  level only. `burgee@1.7.2`'s
  `dist/config-layers.js` calls it. **Criterion 3 is held in published code.** The minor will
  publish a version number and a changelog entry for an API npm already serves.
- **Criterion 4 is held on `main` and not yet published.** The bytes row is on `/docs/benchmarks`
  (`seniority/lilconfig` 0.615). The spawn row (`seniority/lilconfig − lilconfig`) and the
  discovery-chain row (`seniority/cosmiconfig + seniority/find-up` against `cosmiconfig +
  find-up`) are gated on every PR (`bench.yml`). They are not on the page, because the page is
  generated from the newest *published* measurement (`benchmarks/published.ts`), which is
  2026-10-19 at `66e4611`, before both rows existed.

| # | criterion | state |
| :-- | :-- | :-- |
| 1 | four suites graded, `--control` first, ratcheting | held (unchanged below) |
| 2 | the truth table as a generated page | held, `seniority@1.1.0` and later |
| 3 | `explain(key)` names the file and line, all four sources set | held, and published in `seniority@1.1.1` (read from the tarball) |
| 4 | rows under `lilconfig` on bytes and spawn delta, and the discovery-chain row, published | gated on `main`; the spawn and chain rows are **not on `/docs/benchmarks`** · **OPEN** |
| 5 | shared truth-table vectors green in both suites | held |

**What closes it.** A new published measurement (`benchmarks/results/cli-benchmarks/<date>.json`,
chosen by a person per `benchmarks/published.ts`) taken after #1264, then `npm run bench:page`,
so `/docs/benchmarks` carries the spawn and discovery-chain rows. No release is needed. seniority
is stamped `shipped` in that PR.

## Status (2026-10-26)

Every criterion is now built on main or on `feat/seniority-remainder`. The intent stays
`approved` until the seniority **minor** that ships `packageLayer` is on npm
(`.changeset/seniority-package-field-lines.md`; `packageLayer` is new public API, and burgee's
`--explain` reads it). Criteria 2 and 5 and most of 3 shipped in `seniority@1.1.0` (#1203).
Criterion 4's rows are gated on every PR from this change; they reach `/docs/benchmarks` with
the next published run.

| Criterion | State | Check |
| :-- | :-- | :-- |
| 1. Four vendored suites graded, `--control` first, ratcheting | held: cosmiconfig 242 / 243, lilconfig 77 / 77, rc 1 / 1, dotenv 193 / 193 | `npm run compat -- cosmiconfig lilconfig dotenv rc`; spec § R10 |
| 2. The truth table as a generated page from the exported table, one row per combination | **held**, shipped in 1.1.0: `TRUTH_TABLE = truthTable(ORDER)`, 32 rows; the page `guides/truth-table` written from it | `packages/seniority/src/truth-table.test.ts` › "TRUTH_TABLE is the shared vectors, row for row"; `scripts/truth-table-page.test.ts` › "is what TRUTH_TABLE generates" |
| 3. `explain(key)` names the file **and line** for a config-file value, on a fixture with all four sources set | **held** (2026-10-26). The config file's line shipped in 1.1.0, through `extends` too (D-20261020-seniority-provenance-per-chain-file). The `package.json` field now has its line as well: `packageLayer` reads the field's keys one level down, and burgee builds its layer with it. The line scan also stopped citing a nested key of the same name written above the real one | `packages/seniority/src/discovery.test.ts` › "with all four sources set at once…" (`package.json:6`); `packages/seniority/src/config.test.ts` › "the package.json field as a layer, with its lines (R3)"; `packages/burgee/src/precedence-vectors.test.ts` › "a package.json field that wins carries the line…" |
| 4. Benchmark rows under `lilconfig` on bytes and spawn delta, and the seven-package discovery-chain row | **held** (2026-10-26). Bytes: `seniority/lilconfig` 0.612 of lilconfig. Spawn delta: `seniority/lilconfig − lilconfig` −0.19 ms, gated at +2 ms of runner noise over R9's bar (D-20261026-seniority-spawn-bars). Discovery chain: `seniority/cosmiconfig + seniority/find-up` against `cosmiconfig + find-up`, 0.154 bundled, 1 package installed against 10 (the intent's seven was counted at cosmiconfig 9 and find-up 5). `seniority/dotenv` is timed too and starts slower than dotenv: B-20261026-seniority-dotenv-starts-slower | `npm run bench -- --axis perf --axis weight --check`; `benchmarks/ratchet.test.ts` › "B2 cold start — seniority R9…" and "says whose bar each installed gate is…" |
| 5. The shared truth-table vectors green in both suites | **held**, shipped in 1.1.0: one edit to `ORDER` fails both suites at once | `packages/seniority/src/truth-table.test.ts`; `packages/burgee/src/precedence-vectors.test.ts`; `scripts/shared-vectors-lock.test.ts` |

The design is modelled: [`precedence.qnt`](./precedence.qnt) holds `safety` over 20,000 traces,
and five rejected designs each fail it (`models.yml`).

## Open questions

- **Does `resolve` stay synchronous?** **Decided 2026-09-20 → D-021.** `fs.existsSync` in a bounded loop is fast and makes
  the API trivial; async loaders (a `.ts` config through a transform) may force a dual API,
  which doubles the surface being graded.
- **How much of `cosmiconfig`'s search semantics are worth reproducing?** **Decided 2026-09-20 → D-022.** Its suite is the
  grader, and its search-places model is larger than the truth table needs. Where they
  disagree, the divergence must be listed and reasoned, not silently lost.
- **Does `env-paths` (77.6 M/wk) belong here or in `closeout`?** **Decided 2026-09-20 → D-023.** It is OS config-directory
  resolution, which is discovery-adjacent but not precedence.
- **What does `config-layers` actually do?** **Decided 2026-09-20 → D-032.** Published the day this was measured; it has to
  be read before F3 opens, not after.
