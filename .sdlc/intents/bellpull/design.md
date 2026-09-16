# Design — bellpull

Intent: [`intent.md`](./intent.md). Umbrella:
[`cli-foundation-stack`](../cli-foundation-stack/design.md). **Status:** draft.

**This design is conditional.** It describes what gets built *if* the intent's kill gate
clears. Nothing here is started before that evaluation is recorded.

---

## Requirements

- **R1** `run(cmd, args?, opts?) → Promise<Result>` where
  `Result = { ok, code, signal, stdout, stderr, duration, command, executable, timedOut }`.
  **A non-zero exit resolves**, with `ok: false`. Rejection is reserved for: executable not
  found, spawn failure, and the deadline.
- **R2 (Y10)** `timeout` is finite by default. On breach: the child is killed (`SIGTERM`,
  then `SIGKILL` after a grace window), `timedOut: true`, and **`stdout`/`stderr` hold what
  arrived before the kill** — discarding partial output is what makes a CI timeout
  undiagnosable.
- **R3 (Y6)** `which(cmd, opts) → { path, from }` where `from` is the `PATH` entry that
  matched. Executability is checked per platform (`isexe`'s job, inlined); on Windows
  `PATHEXT` ordering is honoured and reported.
- **R4** `runPath({ cwd })` returns `PATH` prefixed with every `node_modules/.bin` from
  `cwd` upward — `npm-run-path`'s contract, using `seniority`-style bounded walking logic
  reimplemented locally (Y1 forbids a sibling dependency; it is a dozen lines).
- **R5 (Y5)** One `Result` value, three renderings: `format(result)` for a human,
  `toJSON(result)` for `--json`, `toEvent(result)` for an agent stream. No branch formats
  twice, and the human text is derived from the record rather than assembled alongside it.
- **R6** Shebang handling, argument escaping and `.cmd`/`.bat` resolution follow
  `cross-spawn`'s semantics, because its suite is the grader. `shell` is off by default and
  documented as an injection surface when on.
- **R7 (Y3)** Root default export matches `execa`'s default; `./which` and `./run-path` are
  separately graded subpaths and separate override targets. Subpath isolation locked as in
  `roundel`.
- **R8 (Y8)** Ceilings: bytes and spawn delta at or under **`tinyexec`** (0 deps, 119.5 M/wk)
  — the rival, not `execa`. A ceiling set at `execa` would be a free pass and dishonest.
- **R9 (Y7)** `execa`, `cross-spawn` and `which` suites vendored into `compat-oracle`,
  `--control` first, ratcheting. `execa`'s is the largest compatibility surface in the
  family; a partial pass rate is published as a partial number, never rounded up.
- **R10 (Y9)** Nothing reads `process.*`; `env` and `cwd` arrive as arguments.
- **R11** `duration` is documented as **wall-clock from spawn to close, including Node's own
  scheduling** — not the child's CPU time. Stated in the type's doc comment, because the
  honest caveat is what makes the number usable.

### Evidence

| R | What supports it | Standing |
| :-- | :-- | :-- |
| R1 | `execa` throws on non-zero exit; every wrapper re-implements the same try/catch | measured behaviour |
| R2 | no incumbent bounds spawn by default; same failure shape `closeout` bounds one layer over | **hypothesis until the matrix runs** |
| R3 | `which` 290 M/wk + `isexe` 243.7 M/wk + `path-key` 244.9 M/wk = 779 M/wk; **neither `tinyexec` nor `nano-spawn` resolves** | measured 2026-09-09 |
| R4 | `npm-run-path` 104 M/wk, 2 deps, last publish 2024-08-26 | measured |
| R6 | `cross-spawn` 212.2 M/wk, 3 deps, last publish 2024-11-18 | measured |
| R8 | `tinyexec` 119.5 M/wk, **0 deps**, published 2026-09-03 | measured — **and this is the risk, not the target** |
| the whole design | `execa`: `engines >=22`, 12 direct deps, 16 packages, 1.42 MB | measured |

## Design

```text
packages/bellpull/src/
  run.ts          spawn, collect, the Result                                  (R1)
  deadline.ts     kill ladder + partial output preservation                   (R2)
  which.ts        resolution + the matched PATH entry                         (R3)
  run-path.ts     node_modules/.bin walking                                   (R4)
  project.ts      format / toJSON / toEvent over one Result                   (R5)
  spawn-args.ts   shebang, escaping, PATHEXT — cross-spawn's semantics         (R6)
  runtime.ts      the structural Runtime shape, nine lines, no import         (Y9)
  index.ts        default = execa's default; named re-exports
  matrix.test.ts  exit codes × signals × timeout × missing executable         (R1, R2)
  weight.test.ts  R8 · shape.test.ts  R7, R10
```

**Order.** The kill gate → `which` (the open position, and the smallest thing that is
useful alone) → `run` + `deadline` → `project` → `spawn-args` → `run-path` → vendor the
three suites → switch `compat-oracle` and `cli-benchmarks` to it → B4 rows.

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
against real use; it does not prove demand, and the README will not imply it does.

## Verification

- `npm test -w bellpull` — the matrix (exit codes, signals, timeout with partial output, a
  missing executable, a shebang script, a `.cmd` on Windows), R8's ceiling, R10's shape lock.
- `npm run compat -- execa cross-spawn which` — three rows, `--control` first, ratcheting,
  with `execa`'s partial rate published as-is.
- `npm run compat` and `npm run bench` themselves, **after** the switch, unchanged — the
  dogfooding loop is the acceptance test.
- **The check that would have caught the original problem.** The original problem is a
  subprocess that never returns and takes an unattended run with it. The matrix includes a
  child that ignores `SIGTERM` and never exits; the cell asserts the parent settles within
  `timeout` + grace, that `timedOut` is true, and that output written before the kill is
  present. Run against real `execa` with no timeout set, the same cell hangs — that control
  is checked in, so the check is known to work rather than assumed to.

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
714,984 B): **82,270 B, a ratio of 0.1151**, up from 0.0067 when this package was seven lines.
`tinyexec` is not installed in this workspace, so no number is claimed against it.

**The `bellpull → closeout` edge is a parameter, not a dependency.** A spawned child must not
be orphaned when the parent is killed, and `closeout` owns bounded exit paths. It cannot be an
`import`: `scripts/package-shape-lock.test.ts` asserts that every package in the foundation
tier — which is `bellpull`, `closeout`, `linegauge`, `seniority` — *"depends on nothing: it is
the floor"*, so a package edge between two of them fails on main. `RunOptions.exitHost` is
therefore the family's R3 idiom: the host is declared structurally, `closeout`'s own
`Registry.add(handler, spec?) => () => void` satisfies it as written, and nothing is imported.
Given no host, `run()` registers no signal handler at all — deciding when the process shuts
down is the layer above's job.

## Handoffs this lane cannot make itself

Three files this lane may not write (`.sdlc/LANES.md`), with the value each should hold:

| file | today | should be | owner |
| :-- | :-- | :-- | :-- |
| `.sdlc/bands/foundation-ceilings.json`, `layers.bellpull` | `ours: 4761`, `ratio: 0.0067` | `ours: 82270`, `ratio: 0.1151` | integrator |
| `packages/compat-oracle/baseline/cross-spawn.json` | `passed: 0`, `rate: 0` | `passed: 68`, `rate: 1` | harness, per the table; the lane, per the sharding paragraph |
| `.sdlc/bands/artifact-size-baseline.json`, `bellpull` | `size: 2613`, `unpackedSize: 5249` | `size: 26698`, `unpackedSize: 82270` | integrator |

The third is the one that makes `npm run lint` red on this branch, and it is worth naming as a
structural problem rather than a chore. `scripts/check-published-artifacts.ts` allows 10%
growth against a baseline in `.sdlc/bands/`, and a lane that turns a seven-line reserved name
into an implementation grows it by 1,467%. The band file is forbidden to every lane but
`integrator`, and `--update-baseline` writes exactly that file — so **no package lane can take
its package from stub to implementation and leave `lint` green.** Every foundation lane after
this one meets the same wall. The fix is the integrator's, and it is either a `--update-baseline`
run alongside the merge or a first-implementation exemption in the script.

The second is the contradiction `.sdlc/LANES.md` already records: the prose assigns a package
lane the baseline fragment of its own incumbents, the table gives `packages/compat-oracle/**`
to `harness`, and `scripts/lanes.ts` reads only the table. Until that is resolved the ratchet
for this row sits at 0, which means a regression from 68 to 1 would pass it.

## The surface a consumer gets, derived from the tree (2026-09-15)

R1–R11 say what bellpull is *for*. This section says what is *in it*, as a list a reader can
scan before installing.

**Derived, not transcribed.** One row per entry in `packages/bellpull/package.json`'s
`exports` map; the names are the exported declarations of the source file each subpath's
`dist/` path is built from. Re-derive with `node -p "Object.keys(require('./packages/bellpull/package.json').exports)"`
and `grep '^export' packages/bellpull/src/<file>.ts`.

| Subpath | What a consumer gets | What it answers |
| :-- | :-- | :-- |
| `bellpull` | `run`, `DEFAULT_TIMEOUT`, `DEFAULT_GRACE`, `SpawnError`; `whichSync`, `whichOrThrowSync`, `whichAllSync`, `searchPath`, `runPath`, `pathExtensions`, `extensionCandidates`, `NotFoundError`; `format`, `toJson`, `toEvent`; `escapeCommand`, `escapeArgument`, `readShebang`, `shebangCommand`; `isWindows`, `pathKey`, `pathOf`, `pathDelimiter`, `ambientRuntime`, `name`; types `Result`, `RunOptions`, `RunEvent`, `ExitHost`, `Resolution`, `SearchEntry`, `WhichOptions`, `Runtime`, `Platform` | run a program and read the result |
| `bellpull/which` | `whichSync`, `whichOrThrowSync`, `whichAllSync`, `searchPath`, `runPath`, `pathExtensions`, `extensionCandidates`, `NotFoundError`; `Resolution`, `SearchEntry`, `WhichOptions` | resolve an executable and report **which `PATH` entry answered** — the open position (R3, R4) |
| `bellpull/cross-spawn` | a default export plus `crossSpawn`, `spawn`, `sync`, `parse`, `_enoent`; `Parsed`, `SpawnOptions` | the drop-in path, graded by `cross-spawn`'s own suite (R6) |
| `bellpull/plugin` | `register`, `validate`, `reset`, `registered`, `contributions`, `substitute`, `directories`, `CONTRACT`, `PluginError`; `Plugin`, `Resolver`, `ResolverWhen`, `Contribution`, `ContributedDirectory`, `PluginErrorCode` | the extension point — see below |
| `bellpull/schema.json` | the family plugin schema, as a file | what a plugin author or an agent validates against |

Three things a reader will want that the table settles:

- **`run` is the only spawning surface, and it resolves for every outcome a process has.** A
  non-zero exit is `ok: false`, not a throw. `Result` carries `ok`, `code`, `signal`,
  `stdout`, `stderr`, `duration`, `command`, `args`, `executable` and `timedOut` — `args` is
  a tenth field R1's list does not mention. Rejection is reserved for the two cases where no
  process ran: the executable did not resolve, and the spawn failed.
- **`searchPath()` is the static projection of resolution.** It returns the directories that
  *would* be searched, each as `{ raw, dir?, skipped? }`, so a caller or an agent reads the
  search order without resolving anything — and sees the two refusals (an empty `PATH` entry,
  a relative one) as holes with reasons rather than inferring them from a miss.
- **`bellpull/cross-spawn` is not re-exported from the root, on purpose.** It reads the
  ambient `process` because its callers expect it to, and the root entry does not, so a
  program importing `bellpull` never picks that up by accident.

### How a consumer extends it

**One key: `resolvers`** — how an executable is found, since `which` is the part every
environment does differently. `packages/bellpull/src/plugin.ts` is the contract and the
truth; the shared `src/schema.json` does not describe this key at all (see below).

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

## Where this document and the code disagree (2026-09-15)

Recorded rather than tidied away. Several of these are the ordinary drift of a design written
before the build; one is a subpath a consumer would look for and not find.

- **R3 names an export that does not exist.** `which(cmd, opts) → { path, from }` — there is
  no export named `which`. The package exports `whichSync`, `whichOrThrowSync` and
  `whichAllSync`, and `Resolution` has a third field, `ext`, that R3 does not mention.
- **R7 names a subpath that does not exist.** `./run-path` is not in the `exports` map and
  there is no `src/run-path.ts`. `runPath` is a function exported from `.` and from `./which`.
  R7 calls `./run-path` a "separate override target"; it is not a target at all, so the
  `npm-run-path` override recipe R4 implies cannot be written.
- **R7's "root default export matches `execa`'s default" is not true.** `src/index.ts` has no
  default export; it is a single named re-export block. The only default export in the
  package is `bellpull/cross-spawn`'s, which is `crossSpawn`. So `overrides: { "execa": … }`
  does not resolve against this package, and no `execa` façade exists.
- **R5 spells the projection `toJSON(result)`; the code exports `toJson`.** `format` and
  `toEvent` match. `project.ts` also exports `outcomeOf` and the `Outcome` type, which R5
  does not mention.
- **The `## Design` file map lists two files that do not exist and omits six that do.**
  Absent: `deadline.ts` (the kill ladder lives in `run.ts`; `deadline.ts` is `closeout`'s
  file) and `run-path.ts`. Present and unlisted: `ambient.ts`, `cross-spawn.ts`, `enoent.ts`,
  `escape.ts`, `plugin.ts`, `shebang.ts`.
- **The plugin host is absent from the requirements.** R1–R11 do not mention `resolvers`,
  `bellpull/plugin` or `bellpull/schema.json`, although PLAN step 1.5 is "bellpull hosts
  resolvers" and the host has shipped. Until this section the design described a package with
  no extension point.
- **The shared `schema.json` does not describe `resolvers`.** It is flagstaff's file
  byte-identical (PLAN 1.1), and its properties are `name`, `contract`, `tokens`, `glyphs`,
  `spinners`, `borders`, `components`, `capabilities`. `resolvers` validates today only
  because the root sets `additionalProperties: true`, so an author validating against the
  published schema gets no check on the key this package exists to host. The same gap exists
  for `caique`'s `widgets` and `closeout`'s `handlers`; fixing it is one cross-package edit to
  flagstaff's source copy, not three.
- **R10 says "nothing reads `process.*`" and one file does.** `src/ambient.ts` exists to read
  it, and `ambientRuntime` is exported from the root. The rule the package keeps is the
  family's one-seam rule, which is a different claim.

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
