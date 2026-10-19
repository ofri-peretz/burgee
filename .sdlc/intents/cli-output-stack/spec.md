# Design — The output stack

Intent: [`intent.md`](./intent.md). **Status:** approved.
**Restated:** 2026-10-18 — see § Restated 2026-10-18

---

## Restated 2026-10-18

**Every requirement row is held on main with a check or moved to the child that owns it, except two unowned rows. REMAINING: R2 env-name single-file lock unbuilt, R12 no-burgee README opening unlocked (S2, a success criterion, is the third; see `intent.md`).** *2026-10-19: R2 is held by `scripts/output-env-lock.test.ts` under D-20261019-output-env-lock-scope. R12 remains, and is further from held than this section said: two openings name burgee (see its row).*

Read on `main` at `1013b65db5` (2026-10-18); no test was run, and every check below was
located on that commit by file and test name. The requirement text below this section is kept
as written. A child's requirement is cited by its own ID (`flagstaff` R8); a child's success
criterion by its position (`flagstaff` S1 is the first bullet of its `## Success criteria`).
`burgee/spec.md` already carries a status row for each floor id U1–U13 these rows enforce, and
several of the restatements here are the ones recorded there.

| ID | promised | on main | check | disposition |
| :-- | :-- | :-- | :-- | :-- |
| R1 | arrows up only, `burgee` first with no dependencies, `caique` → `roundel`, `flagstaff` | the direction rule holds and is locked, with the order reversed: foundation (`linegauge`, `seniority`, `bellpull`, `closeout`, `paratext`, `roundel`) → `flagstaff`, `caique` → `controlroom` → `burgee`. `burgee` depends on five family packages; `caique` on `closeout`, `linegauge`, `paratext`, `roundel`, not `flagstaff` | `scripts/package-shape-lock.test.ts` › "has no external runtime dependencies, and same-repo ones only point up the family (K1, U1, U6)" | restated (D-130, `burgee/spec.md` U1), held |
| R2 | `outputMode(runtime)` in `roundel/policy`; no other family module reads `isTTY`, `NO_COLOR`, `FORCE_COLOR`, `CI`, `CLI_ACCESSIBLE`; process-reference lock in every package; an env-name grep allowing those names in one file | the policy function and the every-package process lock are built. The env-name lock is built since 2026-10-19, scoped by D-20261019-output-env-lock-scope: the code burgee owns, with roundel's two policy subpaths (`roundel/policy`, `roundel/terminal`) as owners and six drop-ins allow-listed by file, each beside the incumbent whose graded read it reproduces. `isTTY` is out of scope: it is a fact about a stream, read by 49 files that hide cursors and size frames | `packages/roundel/src/policy.test.ts` › "outputMode — R1, first match wins"; `packages/burgee/src/process-reference-lock.test.ts` › "no layer source reads process.* outside the three files that own it"; `scripts/output-env-lock.test.ts` › "no module burgee owns reads NO_COLOR, FORCE_COLOR, CI or CLI_ACCESSIBLE outside roundel/policy and roundel/terminal", › "every allow-listed file exists and still reads a policy variable, so no entry outlives its reason" | restated (D-20261019-output-env-lock-scope), held (2026-10-19) |
| R3 | `static(state)` on every component and plugin; `register()` throws `E_NO_STATIC_PROJECTION`; a conformance case in `examples/` | the refusal is built; no file under `examples/` mentions flagstaff | `packages/flagstaff/src/plugin.test.ts` › "R2 · a contribution without a static projection is refused" | held via `flagstaff` R2; the `examples/` case moved → `flagstaff` S1 |
| R4 | a plugin is a JSON-serialisable object plus at most one `frame`; `register()` validates against `flagstaff/schema.json` | built; the shape has two more keys than written (`contract`, `borders`, restated in `flagstaff/spec.md`) | `packages/flagstaff/src/plugin.test.ts` › "R3 · validated against schema.json" | held via `flagstaff` R3 |
| R5 | every capability a subpath, importing only itself and `roundel/policy`; per-subpath weight rules with a ceiling named after the incumbent | every entry has a weight rule and an import allow-list, but the allow-list is per entry, not "only `roundel/policy`": flagstaff entries also reach `linegauge`, `paratext`, `closeout`. Incumbent ceilings are the B4 ratio gates and `subpath-weight-lock` | `packages/flagstaff/src/weight.test.ts` › "imports only what its rule allows"; `scripts/subpath-weight-lock.test.ts` › "a drop-in façade weighs no more than its incumbent (U5)"; `benchmarks/ratchet.test.ts` › "B4 weight — the "lighter than what it replaces" ratio gate" | restated (allow-list per entry, D-148 for burgee), held via `roundel` R7/R8, `flagstaff` R10 |
| R6 | zero external runtime dependencies | built: every dependency is in-family | `scripts/layer-boundaries-lock.test.ts` › "holds zero external runtime dependencies across the family"; `scripts/package-shape-lock.test.ts` › "installs nothing from outside this repository — dependencies, peers or optional (D-111)" | held |
| R7 | a `shape.test.ts` per package and a row in `.sdlc/bands/artifact-size-baseline.json` | all three packages have both | each package's `shape.test.ts` › "the user authored exactly one file, and never ran a build"; `scripts/artifact-size-ratchet-lock.test.ts` › "catches a gzipped-tarball regression" | held |
| R8 | `flagstaff/src/` never gains a `layout` module; a test asserts the file list | built, and the lock also refuses a width or measure pass declared outside `linegauge`. `controlroom/ink`'s flexbox subset (D-158) lives in another package and does not touch this row | `packages/flagstaff/src/plugin.test.ts` › "src/ has no layout module" and › "no module here declares a width or measure pass of its own — every one comes from linegauge" | held via `flagstaff` R7 |
| R9 | `flagstaff check <file>` validates and renders every mode; the schema in the tarball and in `apps/docs` `llms.txt`; a weekly one-turn eval | `check` and the shipped schema are built. `llms.txt` does not carry the schema (`flagstaff/spec.md` records it). The eval exists and has no current reading (see `intent.md` S8) | `packages/flagstaff/src/cli.test.ts` › "prints the plugin in all five modes side by side and exits 0"; `packages/flagstaff/src/plugin.test.ts` › "the shipped schema is the source schema (tsc re-indents it; the content is identical)" | held via `flagstaff` R8; the `llms.txt` half moved → `flagstaff` Constraint 7; the eval moved → `flagstaff` S7 |
| R10 | ESM + `default` (K2); `sideEffects: false`; a tree-shake fixture in B4, root import = subpath bytes ±5% | built and stricter: every same-binding root/subpath pair (at least 25) equal to the byte, in `scripts/` rather than B4. `sideEffects` names each `bin` and the modules that register on load instead of `false` | `scripts/tree-shake-fixture.test.ts` › "a root named import costs what the subpath import costs (U10)"; `scripts/side-effects-lock.test.ts` › "sideEffects tells a bundler the truth (U10)" | restated (D-130, `burgee/spec.md` U10), held |
| R11 | `compat-oracle` vendors chalk, ora, boxen, cli-table3, log-update, clack and inquirer, each `--control`-run and ratcheting | chalk 59 / 59, ora 99 / 99, boxen 213 / 213, cli-table3 29 / 29, log-update 99 / 99, clack 16 / 16 (the stated subset of D-001), `inquirer-core` 41 / 41; `inquirer-prompts` **100 / 213** | `.github/workflows/compat.yml` job "Ratchet · each host's suite against burgee" over `packages/compat-oracle/baseline/<host>.json`; `packages/compat-oracle/src/gate.test.ts` › "fails a known-good implementation that is one case short of its own suite" | held for six hosts; inquirer moved → `inquirer-prompts-drop-in` R3 |
| R12 | each README's first paragraph names its own incumbents and never `burgee`; each tarball installs alone (`scripts/independence-lock.test.ts`) | the install-alone lock is built under another name; the openings name their incumbents. No lock asserts the opening never names burgee, and it is not true: re-read 2026-10-19 at `51fec1ba`, `flagstaff`'s first paragraph ends "no dependency outside the burgee family" and `linegauge`'s says "burgee, caique and flagstaff measure their output with it" (the 2026-10-18 reading of "true by reading" was wrong) | `scripts/independence-install-lock.test.ts` › "installs nothing but itself and the in-family packages it declares"; `scripts/readme-opening-lock.test.ts` › "every published README opens with the incumbent it replaces, then its agent surface" | restated (file name), held except the no-burgee clause → remaining: two README edits plus a clause in `readme-opening-lock`, which touches published package READMEs and is not a check-only change |
| R13 | `release.yml` refuses `roundel`, `flagstaff`, `caique` ≥ 0.1.0 unless `scoreboard-public.json` names the deployed page | built: `scoreboard_gate()` in `release.yml`; the band names `https://burgee.interlace.tools/docs/compatibility` since 2026-09-09 | `scripts/deploy-lock.test.ts` › "the scoreboard band, which gates the stack’s release" › "names a page this repo actually builds" | held |
| R14 | `Runtime` gains `clock`; `json` passed to `outputMode(rt, { json })` | built | `packages/burgee/src/testing-helpers.test.ts` › "clock (R14 of cli-output-stack)" | held |
| R15 | one plugin type and one schema shared with `cli-modularity`'s `definePlugin()` | built: one `schema.json`, byte-identical across every host | `scripts/plugin-schema-lock.test.ts` › "is byte-identical everywhere it is hosted"; `scripts/plugin-contract-lock.test.ts` › "one object registers into every host" | held via `plugin-contract` |
| U13 | `burgee` reaches the family by guarded `import()`; `import 'burgee'` resolves no family specifier | restated by D-136: the entry statically reaches `closeout` and `seniority/precedence` and nothing else in the family; the output stack is denied | `packages/burgee/src/weight.test.ts` › "reaches nothing on its denied list" | restated (D-136), held via `burgee` U13 |

The publish order in `## Design` (`roundel` first, nothing before `burgee/commander`'s pass rate
is public) is history now: all three packages are at 1.x, and R13's gate held while they crossed
0.1.0. `## At approval` items 1–3 are done (`burgee/spec.md` carries U1–U13; the R1 lock and the
R13 step exist).

## Requirements

Each floor row from the intent, with the lock that enforces it. A row without a lock is a
principle, and principles drift.

- **R1** (U1) Dependency arrows point up only: `burgee` → nothing; `roundel` → nothing;
  `flagstaff` → `roundel`; `caique` → `roundel`, `flagstaff`. Enforced by
  `scripts/package-shape-lock.test.ts`, which today requires `dependencies` to be empty and
  is changed to: every dependency must be a workspace package listed in `package.json`
  `workspaces`, and must appear *earlier* in the order `[burgee, roundel, flagstaff, caique]`.
- **R2** (U2) One policy function, `outputMode(runtime)` in `roundel/policy`, and no other
  module in the family reads `isTTY`, `NO_COLOR`, `FORCE_COLOR`, `CI` or `CLI_ACCESSIBLE`.
  Enforced by extending `process-reference-lock.test.ts` to every package and adding an
  env-name grep that allows those names in exactly one file. **Restated 2026-10-19
  (D-20261019-output-env-lock-scope):** the env names are allowed in roundel's two policy
  subpaths and six allow-listed drop-ins; `isTTY` is out of scope; held by
  `scripts/output-env-lock.test.ts`.
- **R3** (U3) Every component and plugin has `static(state)`; `register()` throws
  `E_NO_STATIC_PROJECTION` otherwise. Conformance case in `examples/`.
- **R4** (U4) A plugin is a JSON-serialisable object plus at most one `frame` function;
  `flagstaff/schema.json` is the contract and `register()` validates against it.
- **R5** (U5) Every capability is a subpath; each subpath imports only itself and
  `roundel/policy`; per-subpath weight rules in each package's `weight.test.ts` with a
  ceiling named after the incumbent it replaces.
- **R6** (U6) Zero *external* runtime dependencies. R1's lock is the enforcement.
- **R7** (U7) Each package has a `shape.test.ts` (tarball → temp dir → one file → runs) and
  a row in `.sdlc/bands/artifact-size-baseline.json`.
- **R8** (U8) `flagstaff/src/` never gains a `layout` module; a test asserts the file list.
- **R9** (U9) `flagstaff check <file>` validates a plugin and renders it in every mode; the
  schema ships in the tarball and in `apps/docs` `llms.txt`; `evals/` gains a weekly
  one-turn authoring eval.
- **R10** (U10) ESM + `default` condition (K2); `sideEffects: false`; a tree-shake fixture
  per package in `cli-benchmarks` B4 asserting root-entry named import == subpath bytes ±5%.
- **R11** (U11) `compat-oracle` vendors chalk, ora, boxen, cli-table3, log-update, clack and
  inquirer suites; each gets a `--control` run and a ratcheting pass rate on the scoreboard.
- **R12** (U12) Each package README's first paragraph names its own incumbents and never
  `burgee`; an install test installs each tarball *alone* into a temp dir and imports it.
  Enforced by `scripts/independence-lock.test.ts`.

- **R13** (the publish gate the risk table calls a lock, which did not exist until this row)
  `release.yml` refuses to publish `roundel`, `flagstaff` or `caique` at any version ≥ 0.1.0
  unless `.sdlc/bands/scoreboard-public.json` exists and names the deployed URL of the commander
  compatibility page. Built in S1 before roundel's first working release; until then the
  three stay at 0.0.x.
- **R14** `burgee`'s `Runtime` (the T1 seam) gains `clock: { now(): number; schedule(fn,
  ms): () => void }` with `processRuntime` wiring `performance.now` and `setTimeout`. `json`
  mode is *not* on `Runtime`; the caller passes it to `outputMode(rt, { json })`, because
  whether a run is `--json` is the engine's knowledge, not the process's. A burgee change,
  shipped in S1, additive, no lock moves.
- **R15** The plugin object of `plugin-contract` *is* `cli-modularity`'s `definePlugin()`
  input with three more keys (`tokens`, `spinners`, `components`, `widgets`); one type, one
  schema. `definePlugin` stays the typed identity helper; a bare object is equally valid.
  Neither intent proposes discovery, and `plugin-contract`'s keyword convention is for the
  gallery's index only — recorded so it is never read as the prefix discovery
  `cli-modularity` rejected.

## At approval — the edits the human gate triggers

1. Fold U1–U13 into `burgee/spec.md`'s floor table and change its header
   from 79 to 92 requirements; every stack intent already cites the ids.
2. Change `scripts/package-shape-lock.test.ts` per R1 (same-repo dependencies, ordered).
3. Add the R13 step to `release.yml` and commit an empty `.sdlc/bands/scoreboard-public.json`
   placeholder that the gate treats as absent.
4. Confirm or reject the proposed re-sequencing of `first-adopter` and
   `eslint-plugin-cli-floor` in the index's execution graph.

## Design

```text
packages/
  burgee/      engine, façades, help            → (nothing)
  roundel/     policy · tokens · theme · chalk  → (nothing)
  flagstaff/   loop · projection · plugins · ora/boxen/table/log-update → roundel
  caique/      widgets · decide · clack/inquirer/burgee bindings         → roundel, flagstaff
```

**Shared shapes without shared imports.** Every package types its `Runtime` argument
structurally (`{ stdout, stderr, isTTY, env, clock }`); `burgee`'s `processRuntime`
satisfies it and so does a test double. No package imports a type from another to talk to
it, which is what keeps R1's arrows pointing one way.

**Decisions on the intent's open questions**

- *Where the policy lives:* `roundel/policy`. A fourth package for one function is more
  surface than it saves; `flagstaff` and `caique` already depend on `roundel` for tokens.
- *Plugin discovery:* explicit `register()` only. A `package.json` field is discovery, and
  discovery is configuration by another name (Z1).
- *Characters and mascots:* a spinner with named states. No new plugin key.
- *Names:* `roundel`, `flagstaff`, `caique` — decided and published 2026-09-08.

**Order of work.** `roundel` first (everything depends on it and it is the smallest),
then `flagstaff` with the loop and one built-in spinner before any façade, then `caique`.
Each package publishes only after its scoreboard row exists, and nothing in the stack
publishes a working release before `burgee/commander`'s pass rate is on the docs site.

## Verification

- `npm test` at the root — the shape, weight, process-reference and independence locks
  across every package; red on any arrow pointing the wrong way.
- `npm run compat -- <incumbent>` per façade; the ratchet in CI.
- `npm run evals` — the U9 authoring eval, weekly.
- The check that would have caught the original problem: the independence lock, which
  fails the moment a package's README leads with burgee or its tarball needs a sibling.

## Rejected alternatives

- **One package with subpaths** (`burgee/style`, `burgee/spinner`). Rejected 2026-09-07:
  layers have different buyers and change rates, and a spinner would share a version with a
  parser. See intent.
- **Compound names** (`burgee-style`). Rejected 2026-09-07: a prefix says accessory; each
  layer is a product (U12).
- **Scoped names.** Ruled out by the owner in the index.
- **Peers instead of same-repo dependencies.** Rejected 2026-09-08 with U6: a peer pushes an
  install step onto the user for a package we ship ourselves.
- **Wrapping clack in `caique`.** Reversed 2026-09-08; see `caique/spec.md`.
- **Ink compatibility.** Would mean shipping React; contradicts U6 and U8.
  **Reversed 2026-09-27 by D-158:** `controlroom/ink` is built, with React as the user's optional
  peer reached only by that subpath (U6 holds) and U8 kept as flagstaff's ceiling.

## Out of scope

- listr2 and Ink façades. A task list covers the common case; either is its own intent if
  an adopter asks. (Ink became its own intent, `controlroom`, on 2026-09-27, D-158.)
- A layout engine, ever, without a recorded decision reopening U8.
- Non-Node runtimes for the stack; they arrive with `runtime-smoke.yml`'s matrix, not here.
