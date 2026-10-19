# Design — every drop-in subpath type-checks under `moduleResolution: node10`

Intent: [`intent.md`](./intent.md). **Status:** approved — accepted under the owner's 2026-10-12 delegation.

Grounded on `main` at `1013b65db5` (fetched 2026-10-18). Evidence: barrier 4 in
[`adoption-barriers-2026-10.md`](../../research/adoption-barriers-2026-10.md). TS2307 appeared in
2 of 2 TypeScript CommonJS trial projects: tsc-alias `1077308b` (`moduleResolution: "node"`) and
@swc/cli `2cbd4700` (`module: "commonjs"`).

---

## Today, on `main`

None of the 10 published packages declares `types`, `typings`, `main` or `typesVersions`. That
covers bellpull, burgee, caique, closeout, controlroom, flagstaff, linegauge, paratext, roundel and
seniority. Each declares only `exports`, whose code entries are `{ types, import, default }`
(`package-shape-lock.test.ts` K2).

`node10` ignores `exports`. So under `node10` a consumer fails with TS2307 on 104 specifiers: the
10 package roots, which have no `types` and no `index.d.ts` at the package root, and the 94 typed
subpaths. The 94 by package:

| package | typed subpaths |
| :-- | --: |
| bellpull | 4 |
| burgee | 16 |
| caique | 13 |
| closeout | 9 |
| controlroom | 2 |
| flagstaff | 16 |
| linegauge | 8 |
| paratext | 5 |
| roundel | 9 |
| seniority | 12 |

Eleven subpaths' types do not sit at `dist/<subpath>.d.ts`:

- burgee: `help` → `help-entry.d.ts`, `mcp` → `mcp-entry.d.ts`, `schema` → `schema-entry.d.ts`,
  `yargs/helpers` → `yargs-helpers.d.ts`, `yargs/parser` → `yargs-parser.d.ts`;
- caique: `inquirer/prompts` → `inquirer-prompts.d.ts`;
- closeout: `signal-exit/signals` → `signal-exit-signals.d.cts`;
- controlroom: `ink` → `ink/index.d.ts`;
- seniority: `explain` → `explain-entry.d.ts`, `dotenv/config` → `dotenv-config.d.ts`,
  `dotenv/cli` → `dotenv-cli.d.ts`.

`scripts/declaration-reach.mts`'s `entryDeclarations` already reads `types`, `typings` and
`typesVersions` as entry points. So the prune keeps whatever this spec maps, and needs no change.

## Mechanism — the options compared

| Option | Fixes roots | Fixes subpaths | New files | Exposes non-exported types | Bytes (10 packages, unpacked) | Verdict |
| :-- | :-- | :-- | :-- | :-- | --: | :-- |
| A. Top-level `types` only | yes | **no** | none | no | 300 | insufficient |
| B. `typesVersions` wildcard `{"*": {"*": ["./dist/*"]}}` plus explicit entries for the ten renamed subpaths, plus `types` | yes | yes | none | **yes**: `burgee/execute` would type-check against `dist/execute.d.ts` wherever that file survives the prune, while Node's `exports` refuses it at run time | ≈1,860 | rejected: types that lie about what loads |
| C. Stub directories (`commander/package.json` with `types`), or root-level `commander.d.ts` re-exports | yes | yes | **about 94 files** | no | ≈9,000+ | rejected by the intent: "no new runtime files", "no duplicated `.d.ts`" |
| **D. Top-level `types` plus an explicit `typesVersions` map, one key per typed `exports` subpath, each to that entry's own `types` target** | yes | yes | none | **no**: exactly the `exports` surface | **≈6,260** (5,958 map + 300 `types`) | **chosen** |

D is about 4,400 B more than B, unpacked, across ten packages. That is 0.3–1.0% of each package's
unpacked tarball, and after gzip it is roughly 1.2 KB in total, about 100–250 B per package. For
those bytes, `node10` reaches exactly the subpaths Node itself loads. That is the property that
matters: a type that resolves where the runtime refuses is a TS-green, run-red adoption, which is the
class of defect barrier 1 already showed in the trial.

The map is derived mechanically from `exports`, so it cannot drift by hand (R3).

## Requirements

- **R1 — Each published package declares `types`.** Its value is equal to `exports['.'].types`
  (`./dist/index.d.ts` in all ten). This makes `import … from 'burgee'` resolve under `node10`. No
  `main` is added, and K2's "declares no legacy main" stands.
- **R2 — Each published package declares `typesVersions`.** It has the form
  `{ "*": { "<subpath>": ["<exports['./<subpath>'].types>"], … } }`, with one key for every non-root
  `exports` entry that has a `types` condition. Data subpaths (`*.json`) are not keys. Key order
  follows `exports` order.
- **R3 — The map is the derivation of `exports`, locked.** `scripts/declaration-reach.mts` exports
  `expectedTypes(pkg: TypedPackage): { types: string; typesVersions: Record<string, Record<string, string[]>> }`.
  For every published package, the lock asserts that `pkg.types` and `pkg.typesVersions` deep-equal
  it. On failure, it prints the JSON to paste.
- **R4 — A fixture matrix proves resolution.** One consumer imports the root and every typed subpath
  of all ten packages, which is 104 specifiers. It type-checks with no resolution diagnostic under
  each of five configurations:

  | # | consumer `package.json` | `compilerOptions` |
  | --: | :-- | :-- |
  | 1 | no `type` | `module: commonjs`, no `moduleResolution` (intent criterion 1) |
  | 2 | no `type` | `module: commonjs`, `moduleResolution: node10` |
  | 3 | `"type": "module"` | `module: node16`, `moduleResolution: node16` |
  | 4 | `"type": "module"` | `module: nodenext`, `moduleResolution: nodenext` |
  | 5 | no `type` | `module: esnext`, `moduleResolution: bundler` |

  The resolution diagnostics are TS2307, TS2305, TS2724, TS7016, TS1479 and TS2306. The run sets
  `skipLibCheck: false`, so an unresolved import inside a family `.d.ts` (for example burgee's own
  `roundel/…` types) is reported. With `skipLibCheck: true` it would silently become `any`. The other
  settings are `noEmit`, `strict`, `types: ['node']` from the repo root's `@types/node`, and
  `lib: ['es2023']`.
- **R5 — Modern resolution is unchanged.** No `exports` object changes. Configurations 3–5 pass,
  before and after. Every `typesVersions` target is the same file `exports` already names, so a mode
  that consulted both would reach the same declaration.
- **R6 — The tarball moves only by the map's bytes.** `npm run check:artifacts` passes inside the 10%
  allowance for every package. Each package gets a `patch` changeset.

## Design

1. Add `expectedTypes` to `scripts/declaration-reach.mts`, next to `entryDeclarations`, which already
   walks `exports` targets. Generate the ten `package.json` edits from it once. Commit them by hand
   as data, with no build-time writer.
2. Put the lock where the intent puts it: in `scripts/declaration-reach.test.ts`, the
   "tarball check that already resolves every declaration"
   (D-20261011-tarball-unreachable-declarations), inside the existing
   `describe.each(published)('published package $pkg.name', …)` block. That block already runs over
   every published package and reads built `dist/`, so a new package is covered with no per-package
   fixture to remember. That per-package fixture was the alternative the intent rejected.
3. Add the matrix (R4) as one `describe` in the same file. It runs after the `describe.each`:
   - Write a temp consumer with `mkdtempSync`.
   - Link `node_modules/<name>` to `packages/<dir>` for all ten packages. Use `symlinkSync(…, 'junction')`
     so it runs on the Windows lane too.
   - Write `index.ts` with one `import type * as m<i> from '<spec>'` per specifier. This is a
     type-only namespace import, so no value is needed.
   - Run `ts.createProgram` per configuration, and assert that
     `ts.getPreEmitDiagnostics(program)` filtered to R4's codes is `[]`.
   - On failure, the message lists `code specifier file`.

   `typescript` is already a root devDependency, used by this same script.

### `.d.cts` targets (closeout)

closeout's `./signal-exit` and `./signal-exit/signals` point `types` at `.d.cts` files. Under
`node10`, TypeScript loads an explicitly mapped `.d.cts`. If configuration 1 or 2 reports either
specifier anyway, the build does not edit the lock or `exports` to pass. It records the measured
diagnostic in a decision, `D-YYYYMMDD-closeout-dcts-node10`, under the owner's delegation, and
weighs a one-line `.d.ts` that re-exports the `.d.cts` against leaving those two subpaths ESM-only
for types. The intent's "no duplicated `.d.ts`" forbids copying the declarations; a re-export is not
a copy. That decision is the only thing that may change R2's map for those two keys.

### Order

One PR. Nothing in `migrate.ts` moves, so it does not wait on batch 6.
[`migrate-preflight`](../migrate-preflight/spec.md) is built after it (that spec's R-N10).

## Verification

The loop, from the root after `npm run build` (the lock reads `dist/`, as the existing
`unreachableDeclarations` case does):
`npx vitest run --config vitest.root.config.ts scripts/declaration-reach.test.ts scripts/package-shape-lock.test.ts scripts/pack-list-lock.test.ts`.

| R | Check: file › test name | Shown failing first by |
| :-- | :-- | :-- |
| R1, R3 | `scripts/declaration-reach.test.ts` › `published package $pkg.name` › `declares types and typesVersions equal to its exports, so node10 reaches every subpath` | on `main`: `expected undefined to deeply equal './dist/index.d.ts'`, ×10 |
| R2, R3 | the same test (the `typesVersions` half) | `expected undefined to deeply equal { '*': { commander: [...] … } }` |
| R4 | `scripts/declaration-reach.test.ts` › `every typed subpath resolves under each moduleResolution` › `commonjs, no moduleResolution`, and › `node10` | on `main`: 104 × TS2307, `Cannot find module 'burgee/commander'` among them. That is the trial's error |
| R4, R5 | the same `describe` › `node16 (ESM consumer)`, `nodenext (ESM consumer)`, `bundler` | green on `main` and after. This is the "no regression" half (intent criterion 2) |
| R3 | `scripts/declaration-reach.test.ts` › `expectedTypes` › `maps each typed subpath to its own types target, skips data exports, keeps exports order` (fixture package with a renamed subpath, a `.d.cts` and a `.json`) | the function does not exist |
| R5 | `scripts/package-shape-lock.test.ts` (K2 shape) and `scripts/pack-list-lock.test.ts` | unchanged and green: `exports` is untouched, and every map target is already packed |
| R6 | `npm run check:artifacts` | prints each package's new size. No baseline moves unless the allowance trips |
| field | tsc-alias at `1077308b`, specifier moved by hand to `burgee/commander`, `npx tsc --noEmit` (intent criterion 3) | the trial's `manual` arm: TS2307. Re-run after the release; record the result in Build status |

Prove the matrix's red by running it against `main`'s `package.json` files (`git stash` the ten
manifests) before the edit. Paste the TS2307 count into the PR.

## Constraints

- **No change to `exports`.** It is checked by R5 and by `package-shape-lock.test.ts`.
- **No duplicated `.d.ts`, no new runtime files.** Option D adds two `package.json` fields and nothing
  else.
- **Zero dependencies.** `typescript` is used only in the test, as `declaration-reach.mts` already
  uses it.
- **Offline.** The matrix links the workspace packages and fetches nothing.
- Hooks are the gate: no `--no-verify`.

## Weight and budget

- **Entry and bundle budgets (`weight.test.ts`, `ceilings.json`): none move.** No JavaScript changes.
- **Tarballs (`check-published-artifacts.ts`).** Unpacked, per package:

  | package | `typesVersions` | `types` |
  | :-- | --: | --: |
  | bellpull | 284 B | 30 B |
  | burgee | 1,016 B | 30 B |
  | caique | 780 B | 30 B |
  | closeout | 614 B | 30 B |
  | controlroom | 156 B | 30 B |
  | flagstaff | 946 B | 30 B |
  | linegauge | 510 B | 30 B |
  | paratext | 332 B | 30 B |
  | roundel | 560 B | 30 B |
  | seniority | 760 B | 30 B |

  These were measured on `main`'s `exports` as pretty-printed JSON. The largest is burgee's, about
  0.1% of its 938,302 B baseline. No baseline is expected to move. If one trips because of earlier
  drift, re-baseline by a dated decision under the 2026-10-12 delegation. Never trim the map.

## Compatibility

- A TypeScript consumer on `node10` (or on `module: commonjs` with no resolution set) moves from TS2307 to type-checking. That
  is the fix.
- `node16`, `nodenext` and `bundler` consumers are unchanged (R5).
- The run-time behaviour of every package is unchanged, since no JavaScript or `exports` moves. Ten
  `patch` changesets.
- One known residue is out of scope here: a **CommonJS** consumer under `node16` (not `nodenext`)
  still gets TS1479 for an ES-module-only package. That is the `require(esm)` floor
  ([`migrate-preflight`](../migrate-preflight/spec.md) R3), not resolution, which is why R4 runs
  `node16` and `nodenext` as ESM consumers.

## Quint model: needed? No

This is static package metadata and a deterministic compiler check. It has no state or ordering.

## Rejected alternatives

- **B, the wildcard map.** It costs about 4.4 KB less in total, but it gives types to paths the
  runtime refuses (above).
- **C, stub directories or re-export files.** About 94 new files, which the intent's constraints
  forbid.
- **Tell adopters to switch to `node16`.** That is the 38.8% the intent exists to serve, and TS's own
  default under `module: commonjs` is `node10`.
- **A fixture per package.** Rejected by the intent: ten packages would each have to remember it.
- **A build-time writer for `typesVersions`.** It hides the map from review, and the lock plus a
  pasteable failure message gives the same guarantee with no build step.

## Out of scope

- Data subpaths (`./schema.json` and the others) under `node10` with `resolveJsonModule`. They are
  not drop-ins, and no trial project imports them.
- TypeScript below 4.7, which does not know `.d.cts`, and `classic` resolution, which no package
  manager layout supports.
- `typesVersions` per TypeScript version. The single `"*"` range is all that is needed.

## Open questions

None. The intent fixed where the lock lives and what may not change.

## Build status

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | Built 2026-10-19 | ten `packages/*/package.json` (`types`) | `declaration-reach.test.ts` › `published package $pkg.name` › `declares types and typesVersions equal to its exports, so node10 reaches every subpath` — red ×10 on `main` |
| R2 | Built 2026-10-19 | ten `packages/*/package.json` (`typesVersions`), 95 keys | the same |
| R3 | Built 2026-10-19 | `scripts/declaration-reach.mts` (`expectedTypes`, and `withLegacyTypes` behind `--write-types`, which wrote the ten manifests) | `declaration-reach.test.ts` › `expectedTypes`, › `withLegacyTypes` |
| R4 | Built 2026-10-19 | `scripts/declaration-reach.test.ts` (matrix) | › commonjs, no moduleResolution; › node10 — on `main`'s manifests: **105 of 105** specifiers TS2307, each (`Cannot find module 'burgee/commander'` among them) |
| R5 | Built 2026-10-19 | `exports` unchanged; `controlroom/src/ink/react.ts` | › node16, nodenext, bundler; `package-shape-lock.test.ts`; `pack-list-lock.test.ts` |
| R6 | Built 2026-10-19 | `.changeset/types-under-node10.md` (ten `patch`) | `npm run check:artifacts` green, no baseline moved |

**Built: 6. Not built: 0.** Intent criterion 3 (tsc-alias at `1077308b`) waits for the release.

What the build measured, against what the design expected:

- **105 specifiers, not 104.** `burgee/commander/v14` landed after the design was grounded (#1086).
  The matrix derives its list from `exports`, so it picked the new subpath up with no edit.
- **closeout's `.d.cts` targets resolve under `node10`.** Configurations 1 and 2 report nothing for
  `closeout/signal-exit` or `closeout/signal-exit/signals`, so the `.d.cts` fallback this spec held
  in reserve was not needed and no decision was written.
- **Configurations 3–5 were not green on `main`.** With `skipLibCheck: false`, all three reported
  one TS7016: `controlroom/dist/ink/react.d.ts` named `import("react-reconciler").Reconciler`, an
  ambient shim that is not published, for a peer that ships no types. Every strict consumer of
  `controlroom/ink` with `skipLibCheck: false` had that error, in every resolution mode. The
  `Reconciler` slice moved from the shim into `react.ts`, so the published declaration names a
  local interface; the emitted JavaScript is unchanged.
- **Bytes.** Unpacked +4,808 B across the ten (the design estimated ≈6,260 B; single-target arrays
  are written inline), gzipped +958 B. Largest: burgee, +844 B unpacked and +170 B gzipped. Every
  package stays inside the 10% allowance, so no baseline moved.
