# Design — The output stack

Intent: [`intent.md`](./intent.md). **Status:** approved.

---

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
  env-name grep that allows those names in exactly one file.
- **R3** (U3) Every component and plugin has `static(state)`; `register()` throws
  `E_NO_STATIC_PROJECTION` otherwise. Conformance case in `examples/`.
- **R4** (U4) A plugin is a JSON-serialisable object plus at most one `frame` function;
  `flagstaff/schema.json` is the contract and `register()` validates against it.
- **R5** (U5) Every capability is a subpath; each subpath imports only itself and
  `roundel/policy`; per-subpath weight rules in each package's `weight.test.ts` with a
  ceiling named after the incumbent it replaces.
- **R6** (U6) Zero *external* runtime dependencies. R1's lock is the enforcement.
- **R7** (U7) Each package has a `shape.test.ts` (tarball → temp dir → one file → runs) and
  a row in `.agent/artifact-size-baseline.json`.
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
  unless `.agent/scoreboard-public.json` exists and names the deployed URL of the commander
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

1. Fold U1–U13 into `agent-native-cli-layer/design.md`'s floor table and change its header
   from 79 to 92 requirements; every stack intent already cites the ids.
2. Change `scripts/package-shape-lock.test.ts` per R1 (same-repo dependencies, ordered).
3. Add the R13 step to `release.yml` and commit an empty `.agent/scoreboard-public.json`
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
- **Wrapping clack in `caique`.** Reversed 2026-09-08; see `caique/design.md`.
- **Ink compatibility.** Would mean shipping React; contradicts U6 and U8.

## Out of scope

- listr2 and Ink façades. A task list covers the common case; either is its own intent if
  an adopter asks.
- A layout engine, ever, without a recorded decision reopening U8.
- Non-Node runtimes for the stack; they arrive with `runtime-smoke.yml`'s matrix, not here.
