# Design — bellpull

Intent: [`intent.md`](./intent.md). Umbrella:
[`cli-foundation-stack`](../cli-foundation-stack/spec.md). **Status:** draft.

**This design is conditional.** It describes what gets built *if* the intent's kill gate
clears. Nothing here is started before that evaluation is recorded.

**That sentence is not true of what happened, and it is the first thing an accepter should
see.** The package is built — `run`, resolution, the three projections, a graded
`cross-spawn` façade and the `resolvers` plugin host — and **no evaluation of the kill gate
is recorded anywhere in this repository**. `intent.md`'s gate asks for `tinyexec`'s weekly
downloads, its last publish date and a reading of its current API, re-measured before F4
opens; `tinyexec` is not installed in this workspace and no measurement of it exists here.
So the condition this design set for itself is outstanding, and it is not a thing a lane can
close by reasoning: it needs a number taken on the day it is taken. Recorded here rather
than left for a reader to notice, because accepting a conditional design whose condition was
never evaluated would be accepting the condition away.

**Reconciled against the tree on 2026-09-16** — see "Where this document and the code
disagreed" below for what moved and why. The document now describes what shipped; **it is
not accepted**, and the Design→Build acceptance line is a human's to write
(`CLAUDE.md` rule 3 — the agent that wrote the code does not approve it).

---

## Requirements

- **R1** `run(cmd, args?, opts) → Promise<Result>` where
  `Result = { ok, code, signal, stdout, stderr, duration, command, args, executable, timedOut }`.
  **A non-zero exit resolves**, with `ok: false`. Rejection is reserved for: executable not
  found, and spawn failure.
  *(Corrected 2026-09-16: `args` is a tenth field the first list omitted; `opts` is not
  optional, because `RunOptions.runtime` is what R10 makes mandatory; and the deadline was
  removed from the rejection list, which is the Reconciliations entry "R1 vs R2" below
  already decided in R2's favour and this line still contradicted.)*
- **R2 (Y10)** `timeout` is finite by default. On breach: the child is killed (`SIGTERM`,
  then `SIGKILL` after a grace window), `timedOut: true`, and **`stdout`/`stderr` hold what
  arrived before the kill** — discarding partial output is what makes a CI timeout
  undiagnosable.
- **R3 (Y6)** `whichSync(cmd, opts) → Resolution | undefined`, with `whichOrThrowSync` for
  the throwing form and `whichAllSync` for every hit, where
  `Resolution = { path, from, ext }` and `from` is the `PATH` entry that matched.
  Executability is checked per platform (`isexe`'s job, inlined); on Windows `PATHEXT`
  ordering is honoured and **reported**, which is what `ext` carries.
  *(Corrected 2026-09-16. As written this said `which(cmd, opts) → { path, from }`. There is
  no export named `which`: the resolution surface is the three `…Sync` names, `Sync` because
  it is synchronous and a caller that has to know is a caller who will be surprised once.
  `ext` is the third field, and it is not decoration — it is how "`PATHEXT` ordering is
  honoured **and reported**" is answered.)*
- **R4** `runPath(opts)` returns `PATH` prefixed with every `node_modules/.bin` from the
  working directory upward — `npm-run-path`'s contract, using `seniority`-style bounded
  walking logic reimplemented locally (Y1 forbids a sibling dependency; it is a dozen
  lines). It takes a `WhichOptions`, so the walk starts at `opts.cwd ?? runtime.cwd` and is
  a function of its arguments like everything else here.
- **R5 (Y5)** One `Result` value, three renderings: `format(result)` for a human,
  `toJson(result)` for `--json`, `toEvent(result)` for an agent stream — over one shared
  verdict, `outcomeOf(result) → Outcome` (`'ok' | 'failed' | 'timedOut' | 'signalled'`), so
  the four consumers of "what happened" cannot disagree. No branch formats twice, and the
  human text is derived from the record rather than assembled alongside it.
  *(Corrected 2026-09-16: the projection is spelled `toJson`, not `toJSON`; and `outcomeOf`
  / `Outcome` are the reason the three renderings agree, which the first wording left out.)*
- **R6** Shebang handling, argument escaping and `.cmd`/`.bat` resolution follow
  `cross-spawn`'s semantics, because its suite is the grader. `shell` is off by default and
  documented as an injection surface when on.
- **R7 (Y3)** **Restated 2026-09-16.** Every published entry point is separately adoptable,
  and subpath isolation is locked as in `roundel`: `./which` loads `runtime.js` and
  `which.js` and nothing else, and no entry reaches a package. An **override target** is a
  subpath that stands in for a named incumbent under `overrides`, and there is exactly one
  — `bellpull/cross-spawn`, which is graded by that incumbent's own suite (R6, R9).
  `bellpull/which` is separately adoptable but is **not** an override target, because
  nothing grades it yet (R9).

  The wording this replaces, kept because a bar that is restated and then vanishes is
  indistinguishable from one that was quietly met — *"Root default export matches `execa`'s
  default; `./which` and `./run-path` are separately graded subpaths and separate override
  targets. Subpath isolation locked as in `roundel`."* Three things were wrong with it, and
  only the third is drift:

  - **`./run-path` was never a target.** `runPath` is one function, and it ships from `.`
    and from `./which`. An `npm-run-path` override would be a recipe with no suite behind it.
  - **An `overrides: { "execa": "bellpull" }` recipe would be a defect, not a feature.** The
    native `run` **resolves** on a non-zero exit, which is the product; `execa` throws. A
    consumer who redirected `execa` to this package would have every one of their error
    paths silently stop firing. The one place execa's semantics may be honoured is a façade
    graded by execa's own suite, and R9's execa suite is not vendored. (Whether modern
    `execa` even has a default export to match is *not checked here*: it is not installed in
    this workspace, so nothing in this repository can measure it.)
  - **"separately graded" is true of one subpath, not three.** Only `./cross-spawn` has a
    grade.
- **R8 (Y8)** Ceilings: bytes and spawn delta at or under **`tinyexec`** (0 deps, 119.5 M/wk)
  — the rival, not `execa`. A ceiling set at `execa` would be a free pass and dishonest.
  *(Left as written, and **not met as written** — see Reconciliations and the status table.
  `tinyexec` is not installed in this workspace, so no number is claimed against it; the
  ceiling actually in force is D1's tree-inclusive one. Swapping the ceiling into the
  requirement would hide that substitution, which is the thing the requirement was guarding
  against.)*
- **R9 (Y7)** `execa`, `cross-spawn` and `which` suites vendored into `compat-oracle`,
  `--control` first, ratcheting. `execa`'s is the largest compatibility surface in the
  family; a partial pass rate is published as a partial number, never rounded up.
- **R10 (Y9)** **Restated 2026-09-16.** The family's one-seam rule: **one file may reach the
  ambient world and the working code never does.** `env`, `cwd`, `platform`, `uid` and `gid`
  arrive as a `Runtime` argument everywhere in `run`, `which`, `spawn-args` and the rest, so
  their answers are a function of their inputs. `src/ambient.ts` is the single seam, and
  `ambientRuntime()` is exported from the root so a caller can obtain a `Runtime` without
  rewriting the guarded global lookup itself.

  The wording this replaces — *"Nothing reads `process.*`; `env` and `cwd` arrive as
  arguments."* — is kept visible because it is a **stronger** bar than what shipped, and the
  difference is deliberate rather than a lapse. `bellpull/cross-spawn` is a drop-in, and
  `cross-spawn` reads `process.env`, `process.cwd()` and `process.platform` itself; a
  migration that then required the caller to start passing a runtime would not have been a
  drop-in. So the façade calls the seam and the core never does. Enforced, not asserted:
  `weight.test.ts`'s *"no module but `ambient` reads the ambient world (Y9)"* runs over the
  **built** `dist`, and `./which` and `./plugin` are additionally locked not to reach
  `ambient.js` at all.
- **R11** `duration` is documented as **wall-clock from spawn to close, including Node's own
  scheduling** — not the child's CPU time. Stated in the type's doc comment, because the
  honest caveat is what makes the number usable.
- **R12** **Added 2026-09-16.** bellpull hosts the family's `resolvers` plugin key (PLAN
  step 1.5): `bellpull/plugin` is the contract — `register`, `validate`, `contributions`,
  `substitute`, `directories`, `reset`, `registered`, `CONTRACT`, `PluginError` — and
  `bellpull/schema.json` is the family's shared schema file, byte-identical across every
  host. A `Resolver` carries **no function**, so a search order survives JSON and an agent
  can write one. *Recorded as a requirement because it shipped without being one: R1–R11
  described a package with no extension point, which made the plugin host unreviewable at
  this gate.*

### Evidence

| R | What supports it | Standing |
| :-- | :-- | :-- |
| R1 | `execa` throws on non-zero exit; every wrapper re-implements the same try/catch | measured behaviour |
| R2 | no incumbent bounds spawn by default; same failure shape `closeout` bounds one layer over | **hypothesis until the matrix runs** |
| R3 | `which` 290 M/wk + `isexe` 243.7 M/wk + `path-key` 244.9 M/wk = 779 M/wk; **neither `tinyexec` nor `nano-spawn` resolves** | measured 2026-09-09 |
| R4 | `npm-run-path` 104 M/wk, 2 deps, last publish 2024-08-26 | measured |
| R6 | `cross-spawn` 212.2 M/wk, 3 deps, last publish 2024-11-18 | measured |
| R8 | `tinyexec` 119.5 M/wk, **0 deps**, published 2026-09-03 | measured — **and this is the risk, not the target** |
| R12 | PLAN step 1.5; `caique`, `closeout` and `seniority` host their own key the same way | shipped |
| the whole design | `execa`: `engines >=22`, 12 direct deps, 16 packages, 1.42 MB | measured |

## Status, requirement by requirement

**The Status cell holds two words and nothing else**, `Built` or `Not built`, because
`scripts/plan-progress.ts` reads it — the table shape `seniority` uses. Before this table
existed the checker said of this design: *"the design records no per-requirement status, in
either shape"*, which is not a verdict on the package, it is a verdict on the document. A
`Not built` here is a real answer and two rows carry it.

| R | Status | Where | The check |
| :-- | :-- | :-- | :-- |
| R1 | **Built** | `src/run.ts` — `run()` resolves for every outcome a process has; `Result` carries all ten fields | `matrix.test.ts`, *"a result, not a string and a thrown error (R1)"*: a non-zero exit resolves with `ok: false`, and a missing executable rejects |
| R2 | **Built** | `src/run.ts` — `DEFAULT_TIMEOUT` 30 s, `DEFAULT_GRACE` 5 s, `startDeadline`'s two rungs | `matrix.test.ts`: the ladder on a fake clock, and end to end a child that traps `SIGTERM` — the parent settles, `timedOut` is true, and `'partial output'` is in `stdout` |
| R3 | **Built** | `src/which.ts` — `whichSync` / `whichOrThrowSync` / `whichAllSync`, `Resolution = { path, from, ext }` | `which.test.ts`: `from` changes when the `PATH` order changes; `PATHEXT` is tried in the order `PATHEXT` gives, from a Mac, because the platform is an argument |
| R4 | **Built** | `src/which.ts` — `runPath(opts)`, twelve lines, no sibling dependency | `which.test.ts`, *"runPath — npm-run-path, without npm-run-path"*: every `node_modules/.bin` from cwd upward, terminating at the root, and at a drive root in Windows dialect |
| R5 | **Built** | `src/project.ts` — `outcomeOf` is the one verdict; `format`, `toJson`, `toEvent` are its three renderings | `matrix.test.ts`: *"every rendering comes from one value — none of them can report something the others cannot"* |
| R6 | **Built** | `src/spawn-args.ts`, `escape.ts`, `shebang.ts`, `enoent.ts`, and the façade at `src/cross-spawn.ts`. `shell` is off by default | `cross-spawn`'s own suite through `compat-oracle`: **68 / 68**, control 68 / 68. Plus `escape.test.ts` and `cross-spawn.test.ts` |
| R7 | **Built** | as **restated** above, not as first written: subpath isolation, and one override target — `bellpull/cross-spawn`. There is no root default export and no `./run-path` | `weight.test.ts`: `./which` reaches `runtime.js` and `which.js` and nothing else; every entry declares a budget; no entry reaches a package |
| R8 | **Not built** | The ceiling as written is `tinyexec`, and **`tinyexec` is not installed in this workspace**, so no number is claimed against it — which also means the requirement cannot be evaluated as written. The **spawn-delta** half has no row at all: `benchmarks/` has no bellpull task. What *is* measured is the substituted ceiling (D1's `execa` + `cross-spawn` + `which`) and zero dependencies | `weight.test.ts`: under the band's `ceiling`, and `external` empty for every entry. Neither is R8's comparison, and the gap is named rather than papered over |
| R9 | **Not built** | One of three suites. `cross-spawn` is vendored and graded; **`execa` and `which` are not** — neither appears in `packages/compat-oracle/src/hosts.ts` or under `vendor/`. `execa`'s is the largest surface in the family and its shape depends on the intent's open streaming question, which is still open | `npm run compat -- cross-spawn`. The two missing rows have no baseline fragment, which is the honest state: no rate is claimed for a suite that has never run |
| R10 | **Built** | as **restated** above: `src/ambient.ts` is the one seam, the core takes a `Runtime` | `weight.test.ts`, *"no module but `ambient` reads the ambient world (Y9)"*, asserted over the built `dist`; plus `./which` and `./plugin` locked not to reach `ambient.js` at all |
| R11 | **Built** | `src/run.ts` — the caveat is in `Result.duration`'s doc comment, where a consumer reads it, and `strip-comments.mjs` keeps it in the `.d.ts` | the type ships the sentence; `weight.test.ts` measures the `.d.ts` bytes that carry it |
| R12 | **Built** | `src/plugin.ts` + `src/schema.json`, exported at `bellpull/plugin` and `bellpull/schema.json` | `plugin.test.ts`; `scripts/plugin-schema-lock.test.ts` (byte-identical across every host); `scripts/plugin-contract-lock.test.ts`; PLAN step 1.5 reads green |

**The two `Not built` rows are not a request to build them here.** R9's missing suites are
real work with a design question in front of them, and R8's comparison is one the
Reconciliations section argues is the wrong one. Recording them as unmet is the point: a
requirement that is quietly dropped and a requirement that is met are indistinguishable from
the outside, and this gate is where that difference is supposed to be visible.

## Design

**Re-derived from the tree, 2026-09-16** — `ls packages/bellpull/src`. The map this replaces
listed three files that have never existed (`deadline.ts`, `run-path.ts`, `shape.test.ts`) and
omitted ten that do. A map that names a file a reader cannot open is worse than no map.

```text
packages/bellpull/src/
  run.ts              spawn, collect, the Result — and `startDeadline`, the kill
                      ladder, which lives here rather than in a file of its own
                      because the ladder and the collector share the child       (R1, R2)
  which.ts            resolution, the matched PATH entry, `searchPath`,
                      `resolveExecutable`, and `runPath`                     (R3, R4)
  project.ts          outcomeOf / format / toJson / toEvent over one Result       (R5)
  spawn-args.ts       `parse` — the shape cross-spawn's suite grades               (R6)
  escape.ts           argument and command escaping, cmd.exe's rules               (R6)
  shebang.ts          reading a `#!` line, and the command it names                (R6)
  cross-spawn.ts      the drop-in façade, and the only default export          (R6, R7)
  enoent.ts           cross-spawn's ENOENT emulation, which its suite asserts      (R6)
  ambient.ts          the one seam that reaches the ambient `process`             (R10)
  runtime.ts          the structural Runtime shape, no import                     (R10)
  plugin.ts           the `resolvers` host: validate, register, directories       (R12)
  schema.json         the family's shared plugin schema, byte-identical           (R12)
  index.ts            named re-exports, in one block. **No default export**        (R7)
  matrix.test.ts      exit codes × signals × timeout × missing executable    (R1, R2, R5)
  which.test.ts       the PATH entry, the executable bit, Windows policy      (R3, R4)
  escape.test.ts      escaping, case by case                                       (R6)
  cross-spawn.test.ts the façade's own cases, beside the vendored suite            (R6)
  plugin.test.ts      what register() refuses, and why it refuses at the door     (R12)
  weight.test.ts      byte budgets, zero dependencies, subpath isolation,
                      the one-seam lock, and the ceilings-file handoff   (R7, R8, R10)
```

**Order.** The kill gate → `which` (the open position, and the smallest thing that is
useful alone) → `run` + the deadline → `project` → `spawn-args` → `runPath` → vendor the
three suites → switch `compat-oracle` and `cli-benchmarks` to it → B4 rows.

**Where that order stopped, 2026-09-16.** Everything through `runPath` is done. Of the three
suites, **one** is vendored (`cross-spawn`, 68/68); `execa` and `which` are not (R9). The
dogfooding switch is **one call site**: `benchmarks/axes/weight.ts` spawns `npm pack` through
`bellpull/cross-spawn`, which is where the `npm.cmd` defect actually bit. `compat-oracle`'s
`run.ts`, `vendor.ts` and `upstream.ts` still use `node:child_process` directly and are
carried in `scripts/inline-implementation-lock.test.ts`'s `KNOWN` list — a list that may only
shrink, which is the right place for an unfinished adoption to sit.

**`which` ships first, and possibly alone.** It is the part of this layer nobody contests:
779 M/wk across `which` + `isexe` + `path-key`, and neither zero-dep rival touches it. If
`run` turns out to be a crowded loser, `./which` still stands as a product, and the gate's
"build on resolution + shape" verdict is honoured by shipping the resolution half first.

**The result is the argument.** `execa` throwing on a non-zero exit means every caller wraps
it, and the wrapper always reconstructs the same fields. Returning them makes the common
case straight-line code and makes the three projections (R5) derivable from one value —
which is rule 6 applied one layer below where it usually lives.

**Dogfooding as the honest test.** `compat-oracle` spawns to grade, `cli-benchmarks` spawns
≥30 times per row. Both switch to `bellpull` before it publishes. That proves the API
against real use; it does not prove demand, and the README will not imply it does. **Partly
done** — see "Where that order stopped" above.

## Verification

- `npx vitest run --root packages/bellpull` — the matrix (exit codes, signals, timeout with
  partial output, a missing executable, a shebang script, a `.cmd` on Windows), the byte
  budgets, and the one-seam lock. Both of the last two live in **`weight.test.ts`**; this
  line used to say `shape.test.ts`, which has never existed in this package. `weight.test.ts`
  reads `dist/`, so it must be run after a build — turbo caches, and a package-local vitest
  run against a stale `dist` measures the previous commit.
- `npm run compat -- cross-spawn` — **68 / 68**, `--control` first, ratcheting. The line this
  replaces asked for `execa cross-spawn which`: three rows. Two of the three do not exist
  (R9), and a verification step naming a command that cannot run is not a verification step.
- `npm run compat` and `npm run bench` themselves, **after** the switch, unchanged — the
  dogfooding loop is the acceptance test.
- **The check that would have caught the original problem.** The original problem is a
  subprocess that never returns and takes an unattended run with it. The matrix includes a
  child that ignores `SIGTERM` and never exits; the cell asserts the parent settles within
  `timeout` + grace, that `timedOut` is true, and that output written before the kill is
  present. **Proven red, but not by the control this line used to claim.** The text said
  "run against real `execa` with no timeout set, the same cell hangs — that control is
  checked in". No such control is checked in, and `execa` is not installed in this
  workspace, so it could not run if it were. What *is* checked in is stated in the cell's own
  doc comment: without the second rung of the kill ladder the cell hangs on POSIX until
  vitest's file timeout kills it — which is the same failure arriving one level up. The
  first rung is separately proven on a fake clock and a fake child in `the kill ladder`,
  which does not depend on a child being able to refuse.

## Reconciliations — decided while building, 2026-09-15

Three things this document asks for could not all be true at once. Each is recorded here with
what was chosen and why, rather than settled silently in code.

**R1 vs R2: a breached deadline resolves, it does not reject.** R1 lists the deadline under
"rejection is reserved for"; R2 says a breach yields `timedOut: true` with the output that
arrived before the kill. A rejected promise has no `Result` to carry either on, and R2's whole
content is that the partial output survives, because a CI timeout with the output discarded is
undiagnosable. **R2 wins.** `run()` resolves with `ok: false`, `timedOut: true`,
`signal: 'SIGKILL'` and the partial output. Rejection is reserved for the two cases where no
process ran at all: the executable did not resolve, and the spawn failed.

**R8's ceiling is `tinyexec`, and that is the wrong comparison for what got built.** The
instinct is right — a ceiling set at `execa` would be a free pass. But `tinyexec` does not
resolve executables, and roughly half of what is on disk here is resolution, so comparing the
two on bytes compares a package that can answer "which binary ran" against one that cannot,
and the smaller number wins by not doing the job. Measured instead against the `ceiling`
`.sdlc/bands/foundation-ceilings.json` already holds (`execa` + `cross-spawn` + `which`,
714,984 B), where the ratio was **0.0067** when this package was seven lines and is an order
of magnitude higher now that it has an implementation. `tinyexec` is not installed in this
workspace, so no number is claimed against it.

**The live figure is the band file, not this sentence.** `layers.bellpull.ours` in
`.sdlc/bands/foundation-ceilings.json` is the one home for it, and `weight.test.ts` recomputes
it from the same `npm pack` the band uses rather than pinning a copy. The number transcribed
here on 2026-09-15 (82,270 / 0.1151) was already wrong a day later — two bellpull branches
landed together and the merged tree measured higher — which is the argument for citing the
file instead of restating its contents in prose.

**The `bellpull → closeout` edge is a parameter, not a dependency.** A spawned child must not
be orphaned when the parent is killed, and `closeout` owns bounded exit paths. It cannot be an
`import`: `scripts/package-shape-lock.test.ts` asserts that every package in the foundation
tier — which is `bellpull`, `closeout`, `linegauge`, `seniority` — *"depends on nothing: it is
the floor"*, so a package edge between two of them fails on main. `RunOptions.exitHost` is
therefore the family's R3 idiom: the host is declared structurally, `closeout`'s own
`Registry.add(handler, spec?) => () => void` satisfies it as written, and nothing is imported.
Given no host, `run()` registers no signal handler at all — deciding when the process shuts
down is the layer above's job.

## Handoffs this lane cannot make itself — all three completed

Three files this lane may not write (`.sdlc/LANES.md`). **Every one has since been written by
its owner**, so this section is now a record of a handoff that worked rather than a request:

| file | asked for, 2026-09-15 | holds now, verified 2026-09-16 | owner |
| :-- | :-- | :-- | :-- |
| `.sdlc/bands/foundation-ceilings.json`, `layers.bellpull` | `ours: 82270`, `ratio: 0.1151` | `ours: 86131`, `ratio: 0.1205` — higher, because two bellpull branches landed together and neither lane could measure the other | integrator |
| `packages/compat-oracle/baseline/cross-spawn.json` | `passed: 68`, `rate: 1` | `reference: 68`, `passed: 68`, `rate: 1` | harness, per the table; the lane, per the sharding paragraph |
| `.sdlc/bands/artifact-size-baseline.json`, `bellpull` | `size: 26698`, `unpackedSize: 82270` | `size: 27998`, `unpackedSize: 85906` | integrator |

The numbers landed higher than the ones handed over, and that is the expected shape rather
than a miss: the lane measures its own branch and the integrator measures the merge. Neither
figure is restated anywhere that can go stale without failing — `weight.test.ts` recomputes
`ours` from `npm pack` and compares it against the band.

The third was the one that made `npm run lint` red on this branch, and it is worth naming as a
structural problem rather than a chore. `scripts/check-published-artifacts.ts` allows 10%
growth against a baseline in `.sdlc/bands/`, and a lane that turns a seven-line reserved name
into an implementation grows it by 1,467%. The band file is forbidden to every lane but
`integrator`, and `--update-baseline` writes exactly that file — so **no package lane can take
its package from stub to implementation and leave `lint` green.** Every foundation lane after
this one meets the same wall. The fix is the integrator's, and it is either a `--update-baseline`
run alongside the merge or a first-implementation exemption in the script. **Still unfixed as a
structure**; only this instance was cleared.

The second was the contradiction `.sdlc/LANES.md` already records: the prose assigns a package
lane the baseline fragment of its own incumbents, the table gives `packages/compat-oracle/**`
to `harness`, and `scripts/lanes.ts` reads only the table. The fragment now holds
`reference: 68`, so the ratchet has something to hold; the ownership contradiction it exposed
is **not** resolved, and the next lane in this position meets it again.

## The surface a consumer gets, derived from the tree (re-derived 2026-09-16)

R1–R12 say what bellpull is *for*. This section says what is *in it*, as a list a reader can
scan before installing.

**Derived, not transcribed.** One row per entry in `packages/bellpull/package.json`'s
`exports` map; the names are the exported declarations of the source file each subpath's
`dist/` path is built from. Re-derive with `node -p "Object.keys(require('./packages/bellpull/package.json').exports)"`
and `grep '^export' packages/bellpull/src/<file>.ts`. **Re-derived 2026-09-16, and it had
drifted in four rows** — which is what a table that says "derived" earns the moment nobody
re-derives it. `resolveExecutable` was missing from two rows, `delimiter` and `sep` from
`./which`, and two type exports from `./cross-spawn`.

| Subpath | What a consumer gets | What it answers |
| :-- | :-- | :-- |
| `bellpull` | `run`, `DEFAULT_TIMEOUT`, `DEFAULT_GRACE`, `SpawnError`; `whichSync`, `whichOrThrowSync`, `whichAllSync`, `searchPath`, `runPath`, `resolveExecutable`, `pathExtensions`, `extensionCandidates`, `NotFoundError`; `format`, `toJson`, `toEvent`; `escapeCommand`, `escapeArgument`, `readShebang`, `shebangCommand`; `isWindows`, `pathKey`, `pathOf`, `pathDelimiter`, `ambientRuntime`, `name`; types `Result`, `RunOptions`, `RunEvent`, `ExitHost`, `Resolution`, `SearchEntry`, `WhichOptions`, `Runtime`, `Platform` | run a program and read the result |
| `bellpull/which` | `whichSync`, `whichOrThrowSync`, `whichAllSync`, `resolveExecutable`, `searchPath`, `runPath`, `pathExtensions`, `extensionCandidates`, `NotFoundError`, `delimiter`, `sep`; `Resolution`, `SearchEntry`, `WhichOptions` | resolve an executable and report **which `PATH` entry answered** — the open position (R3, R4) |
| `bellpull/cross-spawn` | a default export plus `crossSpawn`, `spawn`, `sync`, `parse`, `_enoent`; `Parsed`, `SpawnOptions`, `ChildProcess`, `SpawnSyncReturns` | the drop-in path, graded by `cross-spawn`'s own suite (R6) |
| `bellpull/plugin` | `register`, `validate`, `reset`, `registered`, `contributions`, `substitute`, `directories`, `CONTRACT`, `PluginError`; `Plugin`, `Resolver`, `ResolverWhen`, `Contribution`, `ContributedDirectory`, `PluginErrorCode` | the extension point — see below |
| `bellpull/schema.json` | the family plugin schema, as a file | what a plugin author or an agent validates against |

Four things a reader will want that the table settles:

- **`run` is the only spawning surface, and it resolves for every outcome a process has.** A
  non-zero exit is `ok: false`, not a throw. `Result` carries `ok`, `code`, `signal`,
  `stdout`, `stderr`, `duration`, `command`, `args`, `executable` and `timedOut` — ten
  fields, and R1 now lists all ten. Rejection is reserved for the two cases where no process
  ran: the executable did not resolve, and the spawn failed.
- **`searchPath()` is the static projection of resolution.** It returns the directories that
  *would* be searched, each as `{ raw, dir?, skipped? }`, so a caller or an agent reads the
  search order without resolving anything — and sees the two refusals (an empty `PATH` entry,
  a relative one) as holes with reasons rather than inferring them from a miss.
- **`bellpull/cross-spawn` is not re-exported from the root, on purpose.** It reads the
  ambient `process` because its callers expect it to, and the root entry does not, so a
  program importing `bellpull` never picks that up by accident.
- **`resolveExecutable` is the walk a *spawner* needs, and `whichSync` is the walk a *shell*
  needs.** The difference is one `PATHEXT` attempt: `resolveExecutable` retries with
  extension expansion disabled, which is the only way a shebang script with no extension is
  found. Both ship, because a caller doing its own spawning needs the first and a caller
  answering "what would run" needs the second — and a single walk is the defect that made a
  shebang script resolve for the parse and be refused by the run. `delimiter` and `sep` come
  with `./which` for a caller assembling a `PATH` for the platform it is *on* rather than one
  it is describing.

### How a consumer extends it

**One key: `resolvers`** — how an executable is found, since `which` is the part every
environment does differently. `packages/bellpull/src/plugin.ts` is the contract and the
truth; the shared `src/schema.json` does not describe this key at all, and that is a
**declared family decision rather than drift** — see "the shared schema" below. **Resolved 2026-09-23:** the family schema now describes `resolvers`, `widgets`, `handlers`, `sources`, `commands`, `hooks` and `enforce`. flagstaff, the one host that validated against the whole file, validates against its own slice (`plugin.schema.json`), so no host enforces another's keys; `plugin-schema-lock.test.ts` has no allow-list left, and `plugin-schema-agreement.test.ts` holds each definition to its host's verdict.

A plugin is a plain object. bellpull reads three fields and **ignores every other key without
complaining**: a plugin written for flagstaff registers here and contributes nothing, and its
`spinners` are not an error.

| Field | Required | What it must be |
| :-- | :-- | :-- |
| `name` | yes | a non-empty string; how a shadowed resolver is attributed |
| `contract` | no | an integer no greater than `CONTRACT`, which is `1` |
| `resolvers` | no | an object mapping a resolver name to `{ rank, paths, extensions?, when? }` |

A `Resolver` carries **no function at all**, which is the difference between this key and
`closeout`'s `handlers`: a search order is a list of directories, so it survives JSON, an
agent can write one, and `burgee plugin check` can print what `run('node')` would resolve
against without resolving anything.

- `rank` — where this sits relative to `PATH`, which is rank `0`. Negative searches **before**
  `PATH`, which is what a version manager's shims need, because being after `PATH` is the
  same as not being installed. Ties keep registration order.
- `paths` — directories in order. `{VAR}` is substituted from `runtime.env`, the way paratext
  templates an OSC payload.
- `extensions` — extra extensions to try: `PATHEXT` for one resolver rather than the machine.
- `when` — `{ platform?, envAny? }`. Every clause must hold; each array is an OR within
  itself. Absent means always.

**What is validated, at `register()`.** `validate()` refuses a plugin that is not a plain
object; a missing or empty `name`; a `contract` that is not an integer or is newer than this
bellpull knows; a `resolvers` that is not an object; an empty resolver name; a resolver that
is not an object; a missing or non-finite `rank`; an empty or absent `paths`; a path entry
that is not a non-empty string; **a path template that cannot ever be absolute**; and a
`when.platform` or `when.envAny` that is not an array of strings.

**What is refused, and why it is a security boundary.** A resolver's directories are searched
ahead of `PATH`, so whoever writes the plugin decides what `run('node')` means. Two refusals
bound that, and both land at `register()` rather than at search time, because a refusal at
search time is a refusal nobody sees:

- **A path must be absolute.** Checked on the template first — `/opt/bin` and `{HOME}/.local/bin`
  pass, `bin` and `./bin` are refused with the author's own text quoted back. A relative entry
  would mean a different directory every time the program ran from somewhere else, including
  one an attacker can write to.
- **A substitution may not smuggle a `PATH` separator.** `{HOME}` is a value from the
  environment; one containing `:` or `;` would split one contributed directory into two. The
  entry is **dropped**, not split.

**What happens at search time rather than at the door.** `substitute()` returns `undefined`
for an unset variable, an empty one, one carrying a separator, and one that expands to
something not absolute. `directories()` drops those entries silently — which is correct,
because "this entry does not apply here" is the normal answer in an environment where the
tool is simply not installed. A refusal and a drop are therefore different things here, and
the line between them is: the *shape* is refused loudly, the *applicability* is decided
quietly.

**What happens on a bad plugin.** `register()` throws a `PluginError` synchronously and
registers nothing — `validate()` runs before the push. The error carries `code`
(`E_PLUGIN_SCHEMA` or `E_PLUGIN_CONTRACT`), a message naming the plugin, the resolver and the
offending field, and a `fix` sentence.

**Order.** Two resolvers under the same name shadow — later wins, and `contributions()`
records who was shadowed. Two under different names both apply, sorted by `rank`, ties in
registration order. `reset()` forgets everything.

**Nothing here searches.** `directories()` returns the list as data; splicing it around the
entries `searchPath()` returns is the caller's, because the half a plugin is allowed to
decide is *where to look*, not *what ran*.

### What bellpull does not do, and why

Beyond "Out of scope" below:

- **It does not throw on a non-zero exit.** That is the product. The façade at
  `bellpull/cross-spawn` follows its incumbent's semantics; the native API does not, or the
  differentiator disappears.
- **It does not orphan-proof a child by itself.** `RunOptions.exitHost` is a structurally
  declared seam that `closeout`'s `Registry.add` satisfies as written. Given no host, `run()`
  registers no signal handler at all: deciding when the process shuts down is the layer
  above's job, and a package edge between two foundation packages fails
  `scripts/package-shape-lock.test.ts` on main.
- **`shell` is off by default** and is documented as the injection surface it is. It is never
  switched on to solve a Windows problem.
- **It claims no number against `tinyexec`**, which is not installed in this workspace.

## Where this document and the code disagreed (2026-09-15) — reconciled 2026-09-16

The section this replaces listed eight divergences and left them standing. That is why nobody
could accept this design at the Design→Build gate (PLAN **D3**): an accepter would have been
signing a document that named exports and subpaths the package does not have.

Each claim was re-checked against the tree on 2026-09-16 — a day is long enough here, and
three of the eight had already moved. **Where the document was wrong it was corrected; where
the requirement was wrong it was restated with its old wording kept; where the code is simply
missing the requirement now reads `Not built`.** Nothing was built to make a requirement true.

| # | The 2026-09-15 claim | Verdict | What changed |
| :-- | :-- | :-- | :-- |
| 1 | R3 names an export that does not exist — `which(cmd, opts) → { path, from }`; the package exports `whichSync`, `whichOrThrowSync`, `whichAllSync`, and `Resolution` has a third field `ext` | **Still true. The document was wrong** | R3 rewritten to the three `…Sync` names and `{ path, from, ext }`, with `ext` tied to the half of R3 that asks for `PATHEXT` ordering to be *reported* |
| 2 | R7 names a subpath that does not exist — `./run-path` is not in `exports`, there is no `src/run-path.ts`, and `runPath` is a function on `.` and `./which` | **Still true. The requirement was wrong** | R7 restated. `npm-run-path`'s whole surface is one function; a subpath whose only purpose is to be an override target for an incumbent nothing grades would be a recipe with no suite behind it. Old wording kept in R7 |
| 3 | R7's "root default export matches `execa`'s default" is not true; `src/index.ts` has no default export, so `overrides: { "execa": … }` does not resolve | **Still true. The requirement was wrong, and more wrongly than recorded** | Not merely unbuilt: an `execa` override would point a caller's `execa` at a `run` that **resolves** where `execa` throws, silently disarming every error path they have. Restated in R7, old wording kept. Whether `execa` even has a default export is not checked here — it is not installed in this workspace |
| 4 | R5 spells `toJSON(result)`; the code exports `toJson`. `project.ts` also exports `outcomeOf` and `Outcome` | **Still true. The document was wrong** | R5 rewritten to `toJson`, and `outcomeOf` / `Outcome` named as the shared verdict the three renderings agree through — which is the mechanism R5 is actually about |
| 5 | The `## Design` file map lists two files that do not exist and omits six that do | **True, and it understated both halves** | Three files are absent, not two — `deadline.ts`, `run-path.ts` and **`shape.test.ts`**, which the map's last line names and `## Verification` referred to twice. Ten are unlisted, not six: the six source files plus four test files. The map is re-derived from `ls` and now carries every file, with its requirement |
| 6 | The plugin host is absent from the requirements — R1–R11 never mention `resolvers`, `bellpull/plugin` or `bellpull/schema.json` | **Still true. The document was wrong** | **R12 added**, recording the host that shipped under PLAN step 1.5. This is the one addition to the requirement list, and it records a feature rather than asking for one |
| 7 | The shared `schema.json` does not describe `resolvers` | **Resolved 2026-09-23** — the schema describes it, and the `UNDESCRIBED` map below is gone. Before that: **true as a fact, stale as a gap — it was a declared decision** | `scripts/plugin-schema-lock.test.ts` carries an `UNDESCRIBED` map with `resolvers` in it, and the reason is measured rather than asserted: the schema is byte-identical across all seven hosts by design, so describing `widgets` made **flagstaff** validate caique's key and its own suite failed with `plugin.widgets.later: expected object, got boolean`. Describing every key needs each host to validate only its own first — seven packages and a change to the plugin contract's semantics, not a schema edit. Recorded here as a decision with a cost, not as drift. The same test also forbids the list from going stale: a key the schema *does* describe must leave it |
| 8 | R10 says "nothing reads `process.*`" and `src/ambient.ts` does | **True in substance. The requirement was wrong** | R10 restated to the family's one-seam rule, old wording kept visible because it is the *stronger* bar and the weakening is deliberate: a drop-in that required its callers to start passing a runtime would not be a drop-in. One correction to the claim's own wording — `ambient.ts` never writes `process.`; it reads `Reflect.get(globalThis, 'process')` behind a guard, because `declare const process` compiles and then throws `ReferenceError` in a runtime that has none |

### What the 2026-09-15 section missed

Five more, found by the same re-derivation:

- **The `## Verification` section claimed a control that is not checked in.** *"Run against
  real `execa` with no timeout set, the same cell hangs — that control is checked in."* There
  is no such control, and `execa` is not installed, so it could not run. The cell *is* proven
  red, by the mechanism its own doc comment states; the Verification bullet now says the true
  thing instead of the stronger one.
- **`npm run compat -- execa cross-spawn which` cannot run.** Two of the three rows do not
  exist. A verification step that names an impossible command verifies nothing.
- **The "derived, not transcribed" surface table had drifted in four rows** —
  `resolveExecutable` missing from both the root and `./which`, `delimiter` and `sep` missing
  from `./which`, two type exports missing from `./cross-spawn`. A table that says "derived"
  and then is not re-derived is the same defect as the file map, one section further down.
- **All three "Handoffs this lane cannot make itself" rows have been completed**, and the
  numbers landed higher than the ones handed over. The section read as an open request and
  was a closed one.
- **The byte figure transcribed into Reconciliations went stale in a day** (82,270 / 0.1151
  against a band that now reads 86,131 / 0.1205). It is now a pointer to the band file, which
  `weight.test.ts` recomputes rather than transcribes.

One thing found that this lane may **not** fix, recorded for the lane that owns it:
`packages/burgee/src/process-reference-lock.test.ts`'s comment says `bellpull` is absent from
its allow-list because it "names the process nowhere". `src/ambient.ts` does reach the ambient
process; it is invisible to that lock because the name is inside a string literal, which the
lock blanks. bellpull's own `weight.test.ts` catches what the repo-wide lock cannot, so the
seam is enforced — but the repo-wide lock's stated reason for bellpull's absence is not the
true one, and `packages/burgee/**` belongs to the engine lane.

## Rejected alternatives

- **Competing on weight.** Taken, by a zero-dependency package with 119.5 M/wk published six
  days before this was written. Every claim here is resolution and shape; the README says so
  and names `tinyexec` directly. Pretending otherwise would be the one thing that makes the
  family's measured claims untrustworthy elsewhere.
- **Throwing on non-zero exit, for `execa` parity in the native API.** The façade must throw
  to pass `execa`'s suite; the native API must not, or the differentiator disappears. Two
  behaviours, one clearly labelled boundary.
- **Reimplementing `execa`'s template-literal API (`` $`cmd` ``) as the native shape.** It is
  an ergonomic layer over the same result, and adopting it as the primary API would make
  the result secondary — which is the whole product.
- **Depending on `seniority` for the upward walk in R4.** Y1 permits no sibling edges in the
  foundation. Twelve lines duplicated beats a dependency, exactly as with `contrast`.
- **`shell: true` by default.** Every incumbent that did it regrets it; it is the injection
  surface, and defaults are what people ship.
- **Folding `open` (130 M/wk) in now.** It is structurally this layer, and it drags a
  platform-detection surface behind it. Recorded as an intent open question, deliberately
  not designed here.

## Out of scope

- Streaming as a first-class API, pending the intent's open question. Whatever `execa`'s
  suite grades of it is graded; nothing more is promised.
- Process pools, job queues, concurrency limiting. One call runs one program.
- Killing or supervising processes this package did not start; and ending the *current*
  process, which is `closeout`.
- IPC, `fork`, and worker threads. Different contracts, different suites, no measured layer.
