# Design — `burgee migrate` says what the move costs before it writes anything

Intent: [`intent.md`](./intent.md). **Status:** approved — accepted by the coordinator under the
owner's 2026-10-12 delegation,
[`D-20261019-migrate-preflight-design-accepted`](../../decisions/D-20261019-migrate-preflight-design-accepted.md).

Staged on 2026-10-18 against `main` at `1013b65db5`; **re-grounded on 2026-10-19 against `main`
at `e91f842423`**. What moved in between, and what this spec changed because of it, is under
[Re-grounded](#re-grounded-2026-10-19). Evidence: barriers 2, 3 and 8, and the dirty-tree row, in
[`adoption-barriers-2026-10.md`](../../research/adoption-barriers-2026-10.md); raw runs in
[`field-trial.json`](../../research/adoption-barriers/field-trial.json).

---

## Requirements

- **R1 — The report carries `preflight`.** `MigrationReport` (in `packages/burgee/src/migrate.ts`)
  gains `preflight: PreflightRow[]`. The field is always present, and is `[]` when nothing applies.
  It is computed after the dirty-tree check and before any file is written:

  ```ts
  export interface PreflightRow {
    check: 'require-esm' | 'floor' | 'jest-cjs' | 'untracked';
    /** true: the move would leave a tree that cannot load, so nothing is written (R6). */
    blocking: boolean;
    /** What was read, as written: `engines.node ">=10" admits 10.0.0`. */
    found: string;
    message: string;
    /** The same `fix` line every burgee error carries: a command where there is one, else the change to make. */
    fix: string;
  }
  ```

  The rows describe **the drop-ins of every incumbent the run considers**: `--only`, else every
  incumbent `package.json` declares, minus `--skip`, **off-major ones included**. Each such
  incumbent contributes its own bare specifier's target (`commander` → `burgee/commander`), in
  `MAPPING` order; these are the run's *targets*. Off-major incumbents count because every floor
  finding in the trial (5 of 9) was on a project migrate left untouched as off-major: the floor is
  what adopting costs, whether or not this run rewrites anything. A run with no targets raises no
  `require-esm`, `floor` or `jest-cjs` row.
- **R2 — An in-house range reader, with no `semver`.** A new module,
  `packages/burgee/src/migrate-preflight.ts`, exports `admitted(range: string): Interval[] | undefined`
  and `lowestIn(range: string, gaps: readonly Interval[]): string | undefined`. `admitted` returns
  `undefined` for a range it cannot read, and the caller never guesses. The grammar it reads:
  - `||` unions;
  - whitespace-separated comparator sets, intersected;
  - `>=`, `>`, `<=`, `<`, `=` and bare versions, with or without a space after the operator
    (`>= 20.19.0`, as @swc/cli writes it);
  - `^`, `~`, x-ranges (`20.x`, `20`, `*`, `x`, empty) and hyphen ranges (`a - b`);
  - partial versions (`>=16`, `>=16.20`);
  - a leading `v`.

  Prereleases and build metadata are dropped, since Node's releases are `x.y.z`.
- **R3 — `require-esm`, blocking.** It applies when the project is CommonJS (no `"type": "module"`)
  and its declared `engines.node` admits a version in `<20.19.0`, or in `>=21.0.0 <22.12.0`. Those
  are the Node lines on which `require()` of an ES module throws `ERR_REQUIRE_ESM`.
  - `found`: `engines.node "<range>" admits <lowest>`, where `<lowest>` is the lowest admitted
    version inside those lines.
  - `message`: `this package is CommonJS, and require('<first target>') throws ERR_REQUIRE_ESM on
    Node <lowest>, which engines.node allows; raising the floor is a semver-major for this package`.
  - `fix`: `npm pkg set "engines.node=^20.19.0 || >=22.13.0"`. This is the family's own floor from
    `scripts/package-shape-lock.test.ts` (`NODE_FLOOR`). `npm pkg set` edits `package.json` under
    every package manager, and the double quotes hold on POSIX shells, PowerShell and cmd.
  - With no `engines.node` declared, no `require-esm` row is raised, because nothing says which
    Node is promised. R4 reports it instead.
- **R4 — `floor`, a warning.** It applies when the lowest version `engines.node` admits is below
  `20.19.0` and R3 did not fire, or when `engines.node` is absent.
  - `found`: `engines.node "<range>" admits <lowest>`, or `no engines.node`.
  - `message`: `the family needs Node ^20.19.0 || >=22.13.0; adopting raises this package's floor,
    a semver-major for it`.
  - `fix`: the R3 command.
  - Only the minimum is compared. `>=22` is not a row for an ES-module project (intent criterion 2):
    an ES-module importer of the family needs no `require(esm)`. The 21.x and 22.0–22.11 lines
    matter only to CommonJS, which is R3.
  - An unreadable range is a `floor` row with `found: engines.node "<range>" could not be read`.
- **R5 — `jest-cjs`, blocking.** It applies when all four of these hold:
  - jest is declared: `jest` among the declared dependencies, a `jest` key in `package.json`, or a
    `jest.config.{js,cjs,mjs,ts,json}` at the root;
  - the project is CommonJS;
  - `scripts.test` does not contain `--experimental-vm-modules`;
  - neither the `jest` key nor any `jest.config.*` text contains `transformIgnorePatterns`.

  The row:
  - `found`: `jest is declared, and package.json has no "type": "module"`.
  - `message`: `jest loads this CommonJS package through its own module loader, which cannot load
    the ES-module-only <targets>`.
  - `fix`: `set jest's transformIgnorePatterns to "node_modules/(?!(<family>)/)", or run jest under
    node --experimental-vm-modules, then re-run burgee migrate`.
  - `<family>` is **every** family package, `|`-joined (`bellpull|burgee|…|seniority`). A drop-in
    loads its own family dependencies (`burgee/commander` imports `bellpull`), and
    jest's loader has to transform those too, so a pattern naming only the targets' packages would
    trade one `Cannot use import statement outside a module` for the next.
  - migrate never edits the jest config (intent, scope; D-050 … D-054).
- **R6 — A blocking row stops the write, and `--force` does not lift it.** The scan runs as it
  does today. Then, if any row is `blocking` and the planned rewrite changes at least one file:
  - no file is written;
  - `changed` is `false` and `exitCode` is `ExitCode.RUNTIME`;
  - `summary` is `blocked: <n> preflight check(s); nothing written (<m> file(s) would be
    rewritten)`, each count with its noun in the singular or plural.

  `force` changes nothing here; it skips only the git-tree check. `dryRun` gives the same report and
  exit code. When the planned rewrite changes no file (for example, every incumbent is off-major),
  the rows are still reported, and `exitCode` and `summary` are what they are today. No new exit
  code is added.
- **R7 — The dirty-tree refusal names its paths.** `DirtyTreeError` gains `hint`, which lists up to
  10 entries as `git status --porcelain` prints them (`?? node-compile-cache/`), then `… and N more`.
  - When every entry is untracked (`??`), `fix` becomes `add <paths> to .gitignore or commit them,
    or pass --force`.
  - Otherwise `fix` is unchanged: `commit or stash your changes, or pass --force`.
  - `message` is unchanged; `migrate-lexer.test.ts` pins it.
  - Under `--force`, any untracked entries go into a non-blocking `untracked` row that names them, so
    a forced report records what it ignored. Its `fix` is `add <paths> to .gitignore`.
- **R8 — Both surfaces.** `--json` carries `preflight` as data. `textOf` prints a section titled
  `before the move` directly after the summary line, before `rewrote` / `would rewrite`. Each row
  reads `<block|warn>  <check>  <message>; fix: <fix>`. The migrate docs page
  (`apps/docs/content/docs/migrate.mdx`) gains a section, `## What it checks before it writes`, and
  its exit-code table names a blocking preflight under exit 1.

### Not a row: `node10` TypeScript resolution

The intent lists a `node10` row and says it "goes away once
[`types-under-node10`](../types-under-node10/intent.md) lands". **It has landed**: shipped on
2026-10-19 in #1130 (burgee 1.6.2), and `packages/burgee/package.json` carries
`typesVersions['*'].commander`. So this spec adds no tsconfig reader and no `node10` row. R-N10
below is a regression lock: the tsc-alias shape gets no `node10` row, because
`import … from 'burgee/commander'` type-checks under `node10`.

## Design

`migrate-preflight.ts` holds pure functions and has no I/O of its own:
- `admitted`, `lowestIn`;
- `preflightOf(input): PreflightRow[]`, where `input` is the parsed manifest, the declared
  dependency names, the text of each root `jest.config.*` present, the run's targets (R1), and the
  untracked entries `--force` skipped.

`migrate.ts` reads those inputs once. It already reads `package.json` in `declaredIn`; this splits
that into a reader that returns the raw manifest and a pure function that takes the dependency map
off it, so the manifest is read once and both halves use it. Then, in `migrate()`:

1. `checkNames`
2. dirty tree (R7)
3. `offMajorOf`, scan, `heldBy`, second pass
4. **`preflightOf`**
5. if R6 blocks: skip `writeAll`, build the report with `changed: false` and `exitCode: RUNTIME`
6. else: as today

The scan has to run before the decision, because R6 blocks only when something would be written.
No write happens before step 5, which is already true: `writeAll` is the only writer.

`migrate-preflight.ts` is imported statically by `migrate.ts` alone, and `migrate.js` is reached only
by `program.ts`'s dynamic `import('./migrate.js')`. So no entry's static graph grows (K6), and the
`weight.test.ts` denials of `migrate.js` keep covering it.

### The model

Preflight gates a run: it lets the write happen or refuses it, alongside the dirty-tree refusal
that already did. [`preflight.qnt`](./preflight.qnt) states `migrate()` as its awaits — the status
read, the manifest read, the scan, the preflight, the write — with the inputs (dirty or not, all
untracked or not, `--force`, `--dry-run`, a blocking row or not, files planned or not) chosen
nondeterministically. `val safety` is the conjunction of:

- `refusalNeverWrites` (R6) — a blocking row on a planned rewrite leaves zero files written, under
  every `--force` and `--dry-run`;
- `dirtyNeverWrites` (A6) — a dirty tree without `--force` or `--dry-run` writes nothing;
- `dryRunNeverWrites`;
- `decidedBeforeWrite` — no file is written before the preflight has run;
- `blockedExitsRuntime` (R6) — a finished run that was blocked exits 1 and reports `changed: false`.

`writesHappen`, expected to be violated, is the witness that `safety` is not holding because
nothing ever writes. `models.yml` runs on `packages/burgee/src/migrate.ts` as well, so a change to
the gate re-checks the model.

### Order

One PR, R1–R8 and R-N10 together. The staged spec split R5 and R7 into a second PR; the
coordinator's batch plan asks for one, and both prerequisites it waited on
(`migrate-pins-carry-the-drop-in`, `types-under-node10`) have shipped.

## Verification

The loop is `npx vitest run src/migrate-preflight.test.ts src/migrate-cli.test.ts src/migrate-lexer.test.ts src/migrate-u12.test.ts`
in `packages/burgee`. Every row below is red on `main` at `e91f842423` first: run it with
`migrate.ts` checked out from `main` and `migrate-preflight.ts` absent, and record the failure line
in the PR.

The fixtures are the trial projects cut down to the lines that decide each row, at the pinned SHAs.

| Fixture | Shape |
| :-- | :-- |
| wait-port `16083537` | `{ engines: { node: '>=10' }, dependencies: { commander: '^9.3.0', chalk: '^4.1.2' }, devDependencies: { mocha: '^10.0.0' } }`; `bin/wait-port.js` line 4 `const program = require('commander');` |
| svgo `e4cb29be` | `{ type: 'module', engines: { node: '>=16' }, dependencies: { commander: '^11.1.0', picocolors: '^1.1.1' } }`; `lib/svgo.js` `import pc from 'picocolors';` |
| tsc-alias `1077308b` | `{ engines: { node: '>=16.20.2' }, dependencies: { commander: '^9.0.0' }, devDependencies: { jest: '^29.0.0', typescript: '^5.0.0' } }`; `tsconfig.json` `{ "compilerOptions": { "module": "commonjs", "moduleResolution": "node" } }`; `src/bin/index.ts` line 2 `import { Option, program } from 'commander';` |
| @swc/cli `2cbd4700` | `{ engines: { node: '>= 20.19.0' }, dependencies: { commander: '^8.3.0' }, devDependencies: { jest: '^29.0.0', '@swc/jest': '^0.2.0' } }`; `src/index.ts` `import { program } from 'commander';`; `status: () => ['?? node-compile-cache/']` |

| R | Check: file › test name | Shown failing first by |
| :-- | :-- | :-- |
| R2 | `migrate-preflight.test.ts` › `R2 — reads every engines range the trial and the frame wrote` (table: `>=10`→10.0.0, `>=16`→16.0.0, `>=16.20.2`→16.20.2, `>= 20.19.0`→21.0.0 in R3's gaps, `^20.19.0 \|\| >=22.13.0`→none, `>=22`→22.0.0 in R3's gaps and none against the R4 floor, `18 - 22`, `~20.18`, `20.x`, `*`, `>=v18`, `not-a-range`→undefined) | the module does not exist (import fails) |
| R1, R3 | `migrate-preflight.test.ts` › `R3 — the wait-port shape gets a blocking require-esm row naming Node 10.0.0` | `report.preflight` is `undefined` |
| R4 | `migrate-preflight.test.ts` › `R4 — the svgo shape gets a floor warning, and its picocolors still moves` (exit OK, `lib/svgo.js` reads `roundel/picocolors`) | `report.preflight` absent |
| R4 | `migrate-preflight.test.ts` › `R4 — an ES-module project on engines.node >=22 gets no rows` (intent criterion 2) | `report.preflight` absent |
| R5, R7 | `migrate-preflight.test.ts` › `R5 — the @swc/cli shape under --force gets jest-cjs, require-esm from 21.0.0, and untracked` | `report.preflight` absent |
| R5 | `migrate-preflight.test.ts` › `R5 — transformIgnorePatterns or --experimental-vm-modules clears the jest row` | `report.preflight` absent |
| R6 | `migrate-preflight.test.ts` › `R6 — a blocking row on a claimed major writes nothing, even under --force` (the wait-port shape with `commander: '^15.0.0'`: exit RUNTIME, `bin/wait-port.js` byte-identical, `changed: false`, summary starts `blocked:`) | today the file is rewritten and exit is OK |
| R6 | `migrate-preflight.test.ts` › `R6 — rows on a project with nothing to rewrite leave the exit code alone` (wait-port and tsc-alias shapes as trialled: exit OK, summary `nothing to rewrite`, rows present) | `report.preflight` absent |
| R7 | `migrate-lexer.test.ts` › `names the untracked paths in the hint, and offers .gitignore when nothing tracked changed` | `hint` is undefined |
| R7 | `migrate-cli.test.ts` › `A6 — … names the untracked paths on stderr` (real repo, untracked `node-compile-cache/x`) | stderr has no `node-compile-cache` |
| R8 | `migrate-u12.test.ts` › `renders every section a report can carry` (extended with one `preflight` row, asserted to print right after the summary) | no `before the move` line |
| R8 | `migrate-cli.test.ts` › `A8 — a blocking preflight exits RUNTIME with the rows in --json` | exit 0, no `preflight` key |
| R-N10 | `migrate-preflight.test.ts` › `the tsc-alias shape gets no node10 row: types-under-node10 shipped typesVersions` (asserts the full row list, none with a `node10` check, and that `packages/burgee/package.json` has `typesVersions['*'].commander`) | `report.preflight` absent |
| model | `npx @informalsystems/quint run .sdlc/intents/migrate-preflight/preflight.qnt --invariant=safety --max-steps=30 --max-samples=20000` | three mutants of the model (write before the preflight, `--force` lifting a block, a dry run that writes), each caught |
| all | `npx vitest run src/migrate.test.ts src/migrate-bench.test.ts` | unchanged: A1–A12 and the A10 speed budget still pass |

The existing A6 case in `migrate-cli.test.ts` refused a tree whose only entry was an untracked
`src/`, and asserted the tracked-change `fix`. Under R7 that tree gets the untracked `fix`, so the
case commits `src/a.ts` and edits it, and still asserts the tracked `fix` verbatim; the untracked
tree is the new case beside it.

## Constraints

- **Zero runtime dependencies.** No `semver`; R2 is in-house. `package-shape-lock.test.ts` already
  refuses an external dependency.
- **Offline.** No registry read is added. The preflight reads only files in the project.
- **No new exit code.** A blocking row is `ExitCode.RUNTIME` (1), as a refusal is. `exit-code-lock`
  is unchanged.
- **`--force` keeps its meaning.** It skips the git-tree check and nothing else (R6).
- **migrate edits only module specifiers** (D-050). Every `fix` is a line for the maintainer to run;
  migrate never runs `npm pkg set` and never edits jest config.
- Hooks are the gate: no `--no-verify` on any commit of this work.

## Weight and budget

- **Entry budgets (`weight.test.ts`): none move.** `migrate-preflight.js` is reachable only through
  the dynamic `import('./migrate.js')`.
- **burgee tarball (`check-published-artifacts.ts`, baseline in
  `.sdlc/bands/artifact-size-baseline.json`: 246,526 B gzipped / 938,302 B unpacked on
  `e91f842423`).** The estimate is +4–6 KB unpacked and about +1.5 KB gzipped, after
  `strip-comments`. `migrate.d.ts` and `migrate-preflight.d.ts` are unreachable from `exports`, so
  `declaration-reach.mts --prune` drops them.
  - Measure with `npm run check:artifacts` in the PR.
  - If this trips burgee's allowance, trim first; if it still does, record a dated decision
    (`D-YYYYMMDD-burgee-tarball-preflight`) under the owner's 2026-10-12 delegation of baselines,
    with the figure re-measured from `npm pack --dry-run --json`, rounded up to the next 50 B. Do
    not trim the rows to fit.
- **A10 (`migrate-bench.test.ts`).** The preflight adds a constant number of file reads per run: one
  `package.json` already read, plus at most five `jest.config.*` probes. It is not per source file.

## Compatibility

- `--json` gains one key, `preflight`. This is additive, and no existing key changes meaning.
- **Behaviour change.** A run that used to write and exit 0 now writes nothing and exits 1 when a
  blocking row applies. The project the old run would have produced fails to load on a Node its own
  `engines` promises, or fails to load under its own test runner. The changeset is a `minor` for
  `burgee` and says so in one sentence. Per
  [`release-cadence`](../release-cadence/intent.md): no incumbent shipped this, so it is not a
  "behaviour an incumbent shipped as a major", and the summary avoids the Node-floor and ESM-only
  phrases `.sdlc/bands/incumbent-majors.json` reserves for a major.
- The dirty-tree refusal on an untracked-only tree prints a different `fix` (R7). The message and
  exit code are unchanged.
- The façades and `compat-oracle` grades are untouched. `npm run compat -- commander yargs` is
  unchanged.

## Rejected alternatives

- **Rewrite jest config.** Outside the specifier surface migrate is limited to (D-050 … D-054), and
  the intent rejects it.
- **Block on `floor` too.** For an ES-module project on Node 20.0–20.18 or 22.x, the family loads.
  Blocking 65.2% of the frame for a semver-major decision the maintainer can make after migrating
  would turn a report into a wall.
- **Treat a missing `engines.node` as admitting Node 0 and block CommonJS.** Nothing is promised
  where nothing is declared. The warning says what to declare.
- **Add a tsconfig reader for a `node10` row.** It would have been dead code the day
  `types-under-node10` landed, and that intent was cheaper and went first.
- **Name the dirty paths in `message`.** `migrate-lexer.test.ts` pins the message, and agents match
  on it. `hint` is the envelope's place for detail (`failure.ts`, E3).
- **Rows only for the incumbents this run rewrites.** The 5 floor findings were all on off-major
  projects that migrate rewrote nothing in; scoping rows to the rewrite would have reported none of
  them.
- **A transformIgnorePatterns naming only the targets' packages** (the staged spec's
  `dependencies.add` plus declared family packages). It misses the family packages a drop-in loads
  in turn (R5).
- **`add <paths> to .gitignore, or pass --force` for every untracked-only tree** (the staged R7). A
  fresh source file is untracked too, and ignoring it is the wrong advice; the fix offers both.
- **No Quint model** (the staged spec's answer). Preflight is a gate that refuses or lets a write
  happen, and the coordinator routes every such gate to a model; it is small, and its mutants are
  what show the ordering holds.

## Out of scope

- A CommonJS build of the family. The `cli-packaging` floor stands (intent, scope).
- Monorepo walking. The preflight reads the directory migrate is pointed at, as the rest of migrate
  does.
- yarn PnP, and other test runners. mocha, ava and tap load through Node's own `require(esm)`, which
  R3 covers.
- `tsconfig` `extends` chains. They are not read, because no `node10` row exists (see above).
- Node 22.12.x for a CommonJS project. It has `require(esm)`, so R3 does not fire, and its minimum
  is above 20.19.0, so R4 does not either, though the family's floor starts at 22.13.0. Only the
  minimum is compared (R4).

## Re-grounded 2026-10-19

Against `main` at `e91f842423`:

- **Prerequisites shipped.** `migrate-pins-carry-the-drop-in` (#1124) and `types-under-node10`
  (#1130) are both `shipped`. The build waits on neither, and R-N10 is buildable now.
- **Line references.** `NODE_FLOOR` is in `scripts/package-shape-lock.test.ts`; `migrate()`,
  `declaredIn`, `DirtyTreeError`, `textOf` and `summaryOf` are where the staged spec named them;
  `program.ts`'s `migrateCommand` still loads `migrate.js` with a dynamic import; the tarball
  baseline is unchanged at 246,526 / 938,302 B.
- **Commander 14 is claimed** (`SUPPORTED_MAJORS.commander` is `[14, 15]`). The R6 blocking
  fixture uses `^15.0.0`, which is still claimed; the trial shapes (commander 8, 9, 11) are still
  off-major.
- **Changed by this re-grounding:** the run's targets are defined (R1); `<family>` in R5 is the
  whole family; R7's untracked `fix` offers committing as well as ignoring; R6's summary counts
  its nouns; the build is one PR; and a Quint model is added. Each is under *Rejected
  alternatives* with its reason.

## Open questions

None. The intent decided scope. The choices this spec made, warn versus block, the targets, the
jest pattern and the R7 wording, are stated above with their reasons.

## Build status

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | Not built | `migrate.ts` (`MigrationReport.preflight`, `migrate()`) | `migrate-preflight.test.ts` › R3 |
| R2 | Not built | `migrate-preflight.ts` (`admitted`, `lowestIn`) | `migrate-preflight.test.ts` › R2 |
| R3 | Not built | `migrate-preflight.ts` (`preflightOf`) | `migrate-preflight.test.ts` › R3 |
| R4 | Not built | `migrate-preflight.ts` | `migrate-preflight.test.ts` › R4 (×2) |
| R5 | Not built | `migrate-preflight.ts`; root file probe in `migrate.ts` | `migrate-preflight.test.ts` › R5 (×2) |
| R6 | Not built | `migrate.ts` (`migrate()`, `summaryOf`) | `migrate-preflight.test.ts` › R6 (×2) |
| R7 | Not built | `migrate.ts` (`DirtyTreeError`) | `migrate-lexer.test.ts`; `migrate-cli.test.ts` |
| R8 | Not built | `migrate.ts` (`textOf`); `apps/docs/content/docs/migrate.mdx` | `migrate-u12.test.ts`; `migrate-cli.test.ts` |
| R-N10 | Not built | none (a lock) | `migrate-preflight.test.ts` › node10 |
| model | Not built | `preflight.qnt` | `models.yml` |

**Built: 0. Not built: 10.**
