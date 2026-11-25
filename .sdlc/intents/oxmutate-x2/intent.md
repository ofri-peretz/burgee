# Intent — `oxmutate-x2`: three times as fast in container mode, every verdict the same

**Status:** approved · **Opened:** 2026-11-19 · **Owner:** @ofri-peretz · **Parent:**
[`oxmutate-fastest`](../oxmutate-fastest/intent.md), [`oxmutate-container`](../oxmutate-container/intent.md)

---

## What is wanted

The owner's words, 2026-11-19: "improve ourself until we're getting to a point we are twice as fast
from what we're today, without any workarounds … understand where our bottlenecks are, understanding
that in corporate machines like ours we need to run in container mode", and "without compromising
quality".

**Raised to 3.00x by the owner, 2026-11-20** (it was 2.00x): "3x faster than 2.9.0 on
`bench/container.mjs` … without compromising on quality". Every verdict equal, `bench/ab.mjs`
exit 0, nothing skipped, as before. [Path to 3x](#path-to-3x) below says what that takes.

1. A container-mode run of the benchmark corpus takes a third of the wall time it took with oxmutate
   2.9.0, measured the same way, on the same machine.
2. Every mutant gets the same verdict it got before (Killed and Timeout count as one: both are
   detections), on the corpus and on `bench/ab.mjs`'s fixtures.
3. Nothing is skipped to get there: no mutator turned off, no confirmation or audit dropped, no
   smaller test set than a correct verdict needs.

## Why now

Container mode is how oxmutate runs on a machine with an endpoint scanner (measured 2026-11-19: the
host run held Sophos at 384–445% CPU, the container run left it idle). It works; now it has to be
fast enough to run on every push.

## Constraints

- Verdicts first: a speed change lands only with `bench/ab.mjs` showing no verdict differs, and the
  corpus digest (`bench/container.mjs --compare`) equal.
- Measured, not asserted: every claim in a PR carries the numbers, the machine's load and the
  commit; noise is handled by alternating builds and medians.
- **A verdict that differs from 2.9.0 is accepted only when a fresh worker gives it** (the owner's
  coordinator, 2026-11-20). 2.9.0 is itself non-deterministic on some rows (pathe `_glob.ts:178:59`,
  `:279:20`, `:316:43`: a memo hides a mutant that a cold worker kills), so the reference is the
  mutant's verdict from a fresh worker, not the old digest: `OXMUTATE_ISOLATE_ALL=1` (with
  `OXMUTATE_ISOLATE_STATIC=1`, `OXMUTATE_ISOLATE_POLLUTION=1`) runs each
  covered mutant armed from process start. `bench/container.mjs --compare a.json b.json --fresh
ref.json` lists every differing row with its fresh-worker verdict and exits 1 for any it does not
  confirm; the PR carries that list.
- The repository's rules hold: no new dependency, every changed line held by a test (the pre-push
  mutation gate), a fix proven by a check that fails without it.

## Success criteria

- `node packages/oxmutate/bench/container.mjs --compare <baseline-2.9.0>.json <candidate>.json`
  prints a total of 3.00x or more and "every verdict equal", on `ufo`, `pathe`, `defu` and `gen`.
- `node packages/oxmutate/bench/ab.mjs` against 2.9.0 exits 0.

## Where the time goes (2.9.0, container mode, 2026-11-19)

| Target  | Mutants |   Wall | Isolated runs | Of them                                          |  Warm | Static |
| :------ | ------: | -----: | ------------: | :----------------------------------------------- | ----: | -----: |
| `ufo`   |   1,091 | 17.3 s |  12.2 s (70%) | 100 survivor confirmations, 0 overturned         | 3.1 s |  1.1 s |
| `pathe` |   1,090 |  699 s |   414 s (59%) | 416 flaky re-runs, 202 static, 112 confirmations | 239 s |   30 s |
| `defu`  |     103 |  1.2 s |         0.3 s | 12 confirmations                                 | 0.5 s |  0.1 s |

Workstreams, largest first:

1. **Survivor confirmation** re-runs each survivor with a fresh Vitest start per covering file.
   Confirm in a live worker that re-evaluates the modules with the mutant armed from collection
   (the static path's machinery, `staticwarm.qnt`), keeping `confirm.qnt`'s semantics.
2. **Flaky re-runs** cover every mutant a flaky test reaches, including those a deterministic test
   already killed; scope them to the verdicts a flaky test could have decided. **Dry-run time
   limits** that ignore instrumentation's slowdown make heavy tests fail or look flaky.
3. **Warm units**: 92% of a server's unit time is outside armed tests (starting workers, collecting
   files, canaries).
4. **Container overhead**: sync, start-up and copy-back around the engine (about 1.6 s on `ufo`).

## Baseline (2.9.0, `bench/container.mjs`, 2026-11-19 22:09, load 40–50)

| Target  | Mutants |     Wall (median) | Dry run | Mutation | Static | Isolated | Digest             |
| :------ | ------: | ----------------: | ------: | -------: | -----: | -------: | :----------------- |
| `ufo`   |   1,091 |            17.0 s |     0.5 |      2.3 |    0.9 |     11.3 | `3c2eda7110e1635f` |
| `defu`  |     103 |             2.8 s |     0.3 |      0.5 |    0.1 |      0.3 | `353adf3799cdce67` |
| `gen`   |   1,980 |             6.1 s |     1.0 |      1.4 |    0.8 |      1.4 | `ab0fdc77f0ee373f` |
| `pathe` |   1,090 | 243.3 s (1 round) |     3.7 |     53.6 |   58.8 |    122.4 | `84d754320a74d10a` |

Every digest held across rounds. `pathe` swings with the machine's load (699 s at load 50+ earlier
the same day), so a candidate is measured right after a baseline re-run, not against this table.

## Path to 3x

Written 2026-11-20 from reports in hand, before any further measurement. **Every saving below is a
hypothesis** until `bench/container.mjs --compare` shows it; the evidence column says what each rests on.

### What 3x means

The sum of walls on 2.9.0 is about 282 s (`ufo` 17, `pathe` 243, `defu` 2.8, `gen` 6.1 in the
2026-11-19 table; this session's fresh 2.9.0 `pathe` runs gave 238.6 s at load about 63 and 245.8 s at
load 58 to 120, so the baseline is steady to 3%). 3x is at most about 94 s in total. `ufo`, `defu` and
`gen` already run at 1.5x with live confirmation (about 17 s together), so `pathe` has to reach about
**75 s, from 238 s: 3.2x on one repository**, and `pathe` is 85% of the sum. No other target moves
the total.

### `pathe`, 2.9.0, by phase (container mode, 1,090 mutants, one round, load 58 to 63)

| Phase            |      Wall | Made of                                                                                                                                                                                                                                                                         | Evidence                                                                                                                      |
| :--------------- | --------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------- |
| Dry run          |     3.9 s | one pass of 4 test files, instrumented                                                                                                                                                                                                                                          | `dryRunMs`                                                                                                                    |
| Warm units       |    79.1 s | 9,213 armed executions; the servers' unit time is 745 s over 282 units, of which **137 s is inside armed tests: 82% is start-up, collection and canaries**; about 150 pollution restarts, almost all in `_glob.ts`                                                              | `warmUnitMs`, `warmArmedMs`, `pollutionRestarts` of the candidate report (`~/.cache/oxmutate-bench/results/pathe-cand0.json`) |
| Static           |    59.2 s | 243 static mutants over the files that load their module; 111 unarmed re-collections; **75 mutants handed back to fresh workers** by one failure: `utils.spec.ts`'s two `toMatchInlineSnapshot` calls cannot run in a re-collected test ("cannot be used without test context") | `staticRecollections`, `staticFallbacks` (this branch), 2.9.1 probe                                                           |
| Isolated         |    90.5 s | 199 runs: 62 static fallbacks, 116 survivor confirmations, 8 re-runs, 5 stops, 7 unfinished; the 3x stages run few mutants, so possibly one core for their whole wall time (not yet measured)                                                                                   | `isolatedByCause`                                                                                                             |
| Outside the four | about 6 s | instrument, container start, sync, copy-back                                                                                                                                                                                                                                    | wall minus the phases                                                                                                         |

### Levers, and what each would take off `pathe`

|   # | Lever                                                                                                                             | Phase                  |                                         Expected | Evidence and what is unknown                                                                                                                                                                                                                                                                                | Roadmap                     |
| --: | :-------------------------------------------------------------------------------------------------------------------------------- | :--------------------- | -----------------------------------------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------- |
|   1 | Survivor confirmation in live workers                                                                                             | isolated               |                                       about 35 s | done in #1668: 116 confirmations isolated on 2.9.0, 41 left plus 72 decided live on the candidate. The saving is read from counts, not timed: the candidate's isolated phase was 207 to 237 s against 90 s and **is unexplained**; `isolatedStages` (this branch) is the measurement                        | `x2` WS1, merged            |
|   2 | Recover from pollution inside the worker: reset the module registry and carry on, instead of a new worker and a unit split in two | warm                   |                                       15 to 25 s | ~150 restarts, each a worker start of a unit that then runs again; the static path resets a registry in 0.5 ms. Also the cause to test for the `_glob.ts:178:59` / `:279:20` verdict flip (a verdict that depends on how a unit was split). Unknown: the share of the 79 s the restarts cost; profile first | **`1.3`**                   |
|   3 | A worker that outlives its unit                                                                                                   | warm, static, isolated |                                       20 to 40 s | 82% of warm unit time is outside armed tests, and the fresh path starts a worker per (mutant, file) at 80 to 110 ms. The roadmap says "up to 2x on warm". Risk: isolation is what several guarantees rest on; it needs a model                                                                              | **`1.5`**                   |
|   4 | Workers from a heap snapshot                                                                                                      | warm, static, isolated |                                          unknown | spike first; it may not survive Vitest's loader                                                                                                                                                                                                                                                             | **`1.6`**                   |
|   5 | Static mutants where the value is read                                                                                            | static                 |          **about 0.5%, not worth it on `pathe`** | `staticReaders`: 99,007 loader tests against 98,519 reader tests over 243 static mutants, 231 fell back to loaders because their values are read while a module loads                                                                                                                                       | `2.4` (built; nothing here) |
|   6 | The inline-snapshot fallback                                                                                                      | static, isolated       |                                       up to 30 s | 75 mutants of one file take the fresh path. Vitest has no public `setCurrentTest` (4.1.9, 5.1.0), so a re-collected test cannot read its own snapshot: a live fix needs a Vitest seam or a decision to run such a file in one fresh worker per batch instead of per mutant. Not designed                    | new                         |
|   7 | Isolated stages: each run in parallel, the 3x re-runs in the pool, not after it                                                   | isolated               |                                       up to 20 s | the stage timings will say; the container used about one core during the isolated phase of a candidate run                                                                                                                                                                                                  | new, from `isolatedStages`  |
|   8 | Drop mutants that compile to the same code                                                                                        | all                    |                                          unknown | nothing counted on `pathe`; spike: count identical minified outputs                                                                                                                                                                                                                                         | `2.3`                       |
|   9 | Keep the dry run's coverage                                                                                                       | dry                    | at most 3.9 s, and only on a run after the first | the bench measures one run                                                                                                                                                                                                                                                                                  | `3.3` (built)               |

### Does it add up

A reading, not a promise: warm 79 to about 35 (levers 2, 3), static 59 to about 25 (3, 6), isolated 90
to about 15 (1, 6, 7), dry 4, outside 6: **about 85 s, 2.8x on `pathe` and about 2.9x on the sum**.
3x needs the whole list plus a part of lever 4 or 8, or the 82% outside armed tests to fall further
than lever 3's estimate. If the stage timings show the isolated phase is mostly serial stages,
lever 7 is the cheapest large saving and goes first.

### What the measurements found (2026-11-20)

pathe, container mode, one round each, alternating, `OXMUTATE_ISOLATE_CONFIRM=1` so confirmation is the
same everywhere; load 30 to 60. The 2.9.0 runs swing by 25% by themselves (217 to 287 s), so a release
inside that band has not moved.

| Build                                 |             Wall |        Isolated |
| :------------------------------------ | ---------------: | --------------: |
| 2.9.0 (five clean or near-clean runs) | 217.4 to 286.7 s | 80.4 to 159.4 s |
| 2.10.0 (#1668)                        |          258.3 s |         125.4 s |
| 2.10.1 (#1670)                        |          252.2 s |          94.4 s |
| 2.12.0                                |          271.5 s |         136.2 s |

No release regresses with confirmation held fresh. The regression of 2.10.0 on pathe was the live
confirmation itself. The same build, live against fresh, alternating:

|               |                                pathe live |                       pathe fresh |      ufo live |     ufo fresh |
| :------------ | ----------------------------------------: | --------------------------------: | ------------: | ------------: |
| Confirm stage | 57.7 s and 60.0 s for 122 and 130 mutants | 21.7 s and 26.7 s for 119 and 120 | 1.2 s for 100 | 3.9 s for 100 |
| Wall          |                       360.7 s and 338.2 s |               280.5 s and 311.9 s |        14.0 s |        17.7 s |

Live took 0.47 s a confirmation on pathe against 0.18 s fresh: one file, `glob.spec.ts`, cost 2.4 s a
mutant live (186 s of unit time for 61 mutants) against 0.05 s in the other three. A probe that timed
the file's unarmed re-collection did not see it (the re-collection averaged under 750 ms); the cost is in
the armed run and the per-unit start. Removing the worker's own unarmed run of the file (it decided
nothing and ran every body once per unit) did not close the gap. Decision, pre-committed by the
coordinator: live is not faster than fresh on pathe, so **fresh is the default and live is
`OXMUTATE_LIVE_CONFIRM=1`**; ufo gives up about 3.7 s. The 3x path therefore does not come from
confirmation on pathe; it comes from levers 2, 3 and 6 above, and the serial 3x stages (36 to 38 s each
for two to four mutants, present in 2.9.0 too).

### Order

1. `isolatedStages` and `staticFallbacks` in the report (this branch): the measurement the rest needs.
2. Re-run 2 rounds, base and candidate alternating, on a quiet machine, with the stages (the load
   moved the same build between 246 s and 390 s in this session).
3. Lever 7 if the stages show it, then lever 2 (with the `_glob.ts` fixture, failing before), then 3.
4. Lever 6 as its own decision; levers 4 and 8 as spikes.

Next action: the 4 alternating rounds with stages, when the machine is free. Owner: me. Date: 2026-11-20.

### What fresh-first measured (2026-11-22 to 23)

`pathe` is 85% of the sum, and a fresh worker per mutant beats the warm machinery on it, not on the others.
Container mode, 8 workers, alternating, every candidate digest equal to the fresh-worker reference's
(`d54b6cce576533ac` on `pathe`); 2.9.0's `pathe` digest is not stable between rounds (four distinct digests in
eight runs), which is why each differing row is proven against a fresh worker (`--compare a b --fresh ref`).

| Target  | 2.9.0 (2 rounds) | candidate (2 rounds) | Notes                                                                   |
| :------ | ---------------: | -------------------: | :---------------------------------------------------------------------- |
| `pathe` |  199.3 / 230.0 s |        92.2 / 90.6 s | 2.16x, 2.54x; 3 and 4 rows differ, each a fresh worker's verdict        |
| `ufo`   |    15.9 / 16.2 s |        14.5 / 14.3 s | 1.10x, 1.13x                                                            |
| `defu`  |      2.4 / 2.5 s |          2.5 / 2.5 s | flat                                                                    |
| `gen`   |      5.9 / 5.7 s |          5.9 / 5.8 s | flat                                                                    |
| total   |  223.5 / 254.3 s |      115.1 / 113.2 s | **1.94x, 2.25x**: 3.00x is not reached; at 13 workers `pathe` is 84.3 s |

What the stages said (`isolatedStages`, `warmByFile`, `freshByFile`, `dryFiles`, the new report figures):

- A fresh worker starts in 248 ms on `pathe`, 94 on `ufo`, 78 on `gen`. Warm costs 6 to 34 ms a mutant on every
  file but one: `pathe`'s `glob.spec.ts`, 599 ms (443 of it armed), against 78 ms fresh, which stops at the
  first failing test. All-fresh is 121 s on `pathe` and loses 8 to 20 s on `ufo` and `gen`; a per-mutant choice
  from the dry run (a covering time over 49 ms, and over 278 ms for a static mutant) wins on both (`fresh-first.ts`).
- Two figures behind those constants are single points (the warm blow-up from `glob.spec.ts`; the static line
  through `ufo` and `pathe`); a project that sits between them runs the way it did.
- What is left on `pathe`: 78 s of fresh runs at 8 workers, 60% of them worker start-up (`freshFirst`: 713 s of
  unit time against 276 s inside Vitest at 13 workers). Lever 4 (workers from a snapshot) or a worker that
  outlives its run is the way to the 3x; more workers give 91 s at 8 and 84 s at 13.
- Found on the way: a failed `pnpm install` in the container's install chain was swallowed (the shell ignores a
  failing command mid-chain under `set -e`), so a volume kept an old oxmutate for hours: several bench rows here
  measured 2.9.0 under the candidate's label. Fixed in `container.ts`; the bench now installs on its first run
  and refuses a report longer than its wall time.

Next action: lever 3 or 4 on the fresh start-up (the 250 ms), measured on `pathe`, with `freshFirst.unitMs` as the
figure. Owner: me. Date: 2026-11-24.

## Definition of done (the owner, 2026-11-19)

"The container mode will work extremely well and be convenient for real world production usage."
Three times as fast is one part of it. Done means, each checked on a real repository, not a fixture:

1. **Zero-config on common projects.** `{"container": true}` is the whole setup for npm, pnpm,
   Yarn 1 and Yarn 2+ projects, for a workspace monorepo, and for a project on a private registry
   (the host's npm login reaches the install, never the tests).
2. **Every failure says what to do.** Docker not running, an install that fails, a lockfile that
   is out of date, no space on the volume: each gives one line naming the fix.
3. **Fast on every run after the first.** Delta sync, cached install, and the engine work of the
   speed target above, measured by `bench/container.mjs`.
4. **Safe to leave on.** Two runs on one repository do not collide; secrets do not reach the
   tests; `oxmutate prune` removes everything oxmutate made.
5. **Works where it will run.** macOS and Linux with Docker or Podman, and GitHub Actions.
6. **Documented.** README and configuration docs show the one-line setup and the escape hatches.

The corpus of `bench/container.mjs` grows to cover item 1: one target per package manager, one
monorepo, one project behind a private registry (a local registry in a container).

### Use-case coverage (checked against `feat/oxmutate-container-more`, 2026-11-19)

Found by running container mode on a private application (a Next.js app on a private GitHub
Packages scope, oxmutate not among its dependencies, run with `npx oxmutate@2.9.0`).

| Use case                                                       | State                                                          | Where                                                                                  |
| :------------------------------------------------------------- | :------------------------------------------------------------- | :------------------------------------------------------------------------------------- |
| Private registry (host's npm login)                            | in progress                                                    | release PR: `registryAuth`, `installEnv`                                               |
| oxmutate not a dependency of the project (`npx oxmutate`)      | **gap**: `npx --no oxmutate` fails inside                      | next: install the host's own version into the volume during the sync, keyed by version |
| `--since`, `--frozen-oracle`                                   | done, unreleased                                               | release PR: bases via `git archive`                                                    |
| Untracked, non-ignored files (a new config)                    | done                                                           | `git ls-files --cached --others --exclude-standard`                                    |
| Ignored files the tests need (`.env.test`, generated fixtures) | **gap**                                                        | next: `include` globs, opt-in                                                          |
| npm, pnpm, Yarn 1                                              | done                                                           | `defaultInstall`                                                                       |
| Yarn 2+ (`.yarnrc.yml`): install flag and its own auth         | **gap**: `--frozen-lockfile`, home `.yarnrc.yml` not forwarded | next                                                                                   |
| Bun (`bun.lock`)                                               | **gap**: no install chosen, the image has no Bun               | next: a one-line error naming `image`/`install`                                        |
| Docker not running, two runs on one repo                       | done                                                           | release PR                                                                             |

### Checked on a real repository (`bench/container-corpus.mjs`, 2026-11-20, Docker Desktop, macOS)

Run with `{"container": true}` and nothing else, on repositories pinned by commit. The inside
oxmutate is the published 2.11.0; `--candidate-dist` lays this build's `dist` over it only where an
engine-side message was under test (marked †). Each row says what the case found.

| DoD item                         | Case (repo @ commit)                                                                                                               | Result                                                                                                                                                                                                                                                                                                                                                       | Found, fixed                                                                                                                                                                                                                      |
| :------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Yarn 1                           | `acrazing/dpdm` @ `52ac8b8`                                                                                                        | report: 1,187 mutants, exit 0, 349 s then 209 s on the final build (load 25–60)                                                                                                                                                                                                                                                                              | **`EACCES` on the forwarded `~/.npmrc`** (mode 0600, no capability to read another uid's file): R18                                                                                                                               |
| pnpm workspace                   | `twoslashes/twoslash` @ `e88c870`, from `packages/twoslash-remote`                                                                 | report: 295 mutants, exit 0, 35 s, then 18.6 s on the final build                                                                                                                                                                                                                                                                                            | none                                                                                                                                                                                                                              |
| Yarn 2+                          | `Apple-Actions/import-codesign-certs` @ `2429e2f`                                                                                  | report: 210 mutants, exit 0, 8 s then 2.6 s on the final build; on Podman 12.2 s then 2.3 s, same verdicts                                                                                                                                                                                                                                                   | none                                                                                                                                                                                                                              |
| Yarn 2+ whose tests need a build | `electron/asar` @ `8257ba9`                                                                                                        | zero-config fails in the dry run with one line naming `container.install` (†); with `install: "… && yarn build"` a report, 1,237 mutants, exit 0, 1,900 s                                                                                                                                                                                                    | **a symlink to a directory was not sent** (27 failures): R19; **a stale report returned after a failed run**: R20; **`pool: 'forks'` overridden by threads** (`process.chdir`): R21; its dry-run line did not name the build: R22 |
| Yarn 2+ workspace, older Vitest  | `puzzmo-com/xd-crossword-tools` @ `930437b` (Vitest 3.1)                                                                           | fails with one line: "Vitest said options.minThreads and options.maxThreads must not conflict … upgrade vitest" (†)                                                                                                                                                                                                                                          | **"the dry run ran no tests" was a misreport**; R22                                                                                                                                                                               |
| Tests that call the network      | `electron/get` @ `9b4a554` (its suite fails with the network on too)                                                               | fails with one line naming `container.network` (†)                                                                                                                                                                                                                                                                                                           | the line named no fix; R22                                                                                                                                                                                                        |
| Private registry                 | Verdaccio on a Docker network (`oxmutate-corpus`), `@corp/greeter` needs a token; host npmrc a temp file with `${NODE_AUTH_TOKEN}` | install succeeds (shared cache off, so the token is asked for), 7 mutants, exit 0; a test that checks its `NODE_AUTH_TOKEN`, `npm_config_userconfig`, `~/.npmrc`, `/tmp/oxmutate-npmrc` and token-shaped variables passes; the control (`container.env: ["NODE_AUTH_TOKEN"]`) fails that test; without the token the install fails with the 401/403/404 line | none                                                                                                                                                                                                                              |

Not a pass: `electron/update-electron-app` and `electron/get` fail their own suites on a plain
`node:22` with the network on (Windows-only tests; network downloads), so neither is a case of
oxmutate's.

#### Every failure names its fix (captured 2026-11-20)

| Setup                                                                                                                                                                                                                                                                                                                             | Line                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `container.host: tcp://127.0.0.1:1`                                                                                                                                                                                                                                                                                               | `oxmutate: docker could not reach the daemon at tcp://127.0.0.1:1 (container.host). fix: check that it is running and reachable from here (its address, ssh or tls), or remove it to use the local daemon` (was: "daemon is not running … start Docker Desktop")                                                                                                                                                                                                                                     |
| daemon down (`DOCKER_HOST=unix:///nonexistent/docker.sock`; Docker itself was not stopped, others share it)                                                                                                                                                                                                                       | `oxmutate: docker is installed but its daemon is not running. fix: start Docker Desktop (or \`podman machine start\`), or set container.engine`                                                                                                                                                                                                                                                                                                                                                      |
| install fails (a dependency no registry has)                                                                                                                                                                                                                                                                                      | `oxmutate: the sync into the container or its install failed (exit 1); its output is above. fix: for "out of date" or "frozen", update the lockfile on the host … commit it; for 401, 403 or 404, log in to the registry on the host …; otherwise set container.install, or container.image …` (was: "set container.install, or container.image")                                                                                                                                                    |
| lockfile out of date                                                                                                                                                                                                                                                                                                              | the same line; npm's own `npm ci` message is above it                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `bun.lock`, no `install`                                                                                                                                                                                                                                                                                                          | `oxmutate: bun.lock is bun's, and the container installs with npm, pnpm or yarn. fix: set container.image to one with bun (such as oven/bun) and container.install (such as bun install --frozen-lockfile)`                                                                                                                                                                                                                                                                                          |
| no space on the volume, engine side (volume or container create, `cp`)                                                                                                                                                                                                                                                            | `the volume v could not be created: the engine's disk is full. fix: run \`oxmutate prune\` to remove oxmutate's volumes and \`docker system prune\` for the rest, or give Docker Desktop or the Podman machine a bigger disk (\`podman machine set --disk-size\`)`(Podman:`podman system prune`)                                                                                                                                                                                                     |
| a sync or install that fills the volume (output goes to the terminal, so the script's EXIT trap reads `df`: under 64 MiB left on `/w` exits 6). **Real, 2026-11-24, oxmutate 2.18.4, Docker 28.0.1 (Docker Desktop, arm64):** a 24 MiB ext4 volume (loop-mounted in the Docker VM, named by `container.volume`), a Vitest fixture | npm's own `ENOSPC` lines (`npm warn tar TAR_ENTRY_ERROR ENOSPC` ×11, `npm error nospc …`) and the trap's `oxmutate: the volume has no room left` come first, then the one `fix:` line, exit 3: `oxmutate: the sync into the container or its install failed (exit 6): the engine's disk is full. fix: run \`oxmutate prune\` to remove oxmutate's volumes and \`docker system prune\` for the rest, or give Docker Desktop or the Podman machine a bigger disk (\`podman machine set --disk-size\`)` |
| the host's disk full (`tar`, the copy back)                                                                                                                                                                                                                                                                                       | `…: the host's disk is full (<tmpdir> holds the run's staging). fix: free space there, or set TMPDIR to a disk with room`                                                                                                                                                                                                                                                                                                                                                                            |
| Podman 5.6.1 (`podman machine`, applehv, arm64), `container.engine: "podman"`, oxmutate 2.18.4, 2026-11-24: machine stopped                                                                                                                                                                                                       | `oxmutate: podman is installed but its daemon is not running. fix: start Docker Desktop (or \`podman machine start\`), or set container.engine`(podman's own:`unable to connect to Podman socket: failed to connect: dial tcp 127.0.0.1:63789: connect: connection refused`), exit 3                                                                                                                                                                                                                 |
| the same, short image name (`library/node:20-bookworm-slim`)                                                                                                                                                                                                                                                                      | `oxmutate: the container could not be created: Error: short-name resolution enforced but cannot prompt without a TTY. fix: set container.image to a full name, such as docker.io/library/node:24-bookworm-slim`, exit 3. Only with the machine's `999-podman-machine.conf` (one search registry) moved aside, as a Linux Podman's default `registries.conf` has three; with it in place Podman resolves the name and the run succeeds                                                                |
| the same, default image (`node:24-bookworm-slim`, short but aliased)                                                                                                                                                                                                                                                              | no error: 8 mutants, 100.00% score, exit 0 (Podman's `node` alias)                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Checked by unit tests (`packages/oxmutate/src/container.test.ts`, `a full disk says what to free`, 2026-11-23): each case fails on the unfixed `container.ts` (15 failures) and passes on the fix (76 of 76). Then on real engines, 2026-11-24, with the published oxmutate 2.18.4 (fixture: one file, one Vitest test, `{"container": {"volume": …}}`): the full volume on Docker, and the Podman socket and short-name lines, as in the rows above. A first try with a `tmpfs` volume did not work and is not an oxmutate fault: the sync `cp`s its listing into the created container, and the tmpfs mounts only when the container starts, so `/w/listing` is gone (`ENOENT`). A loop-mounted ext4 file behind a `type=none, o=bind` volume does the job. A full volume on Podman itself is not reproduced (the full-disk line is the same code for both engines). The line is one `fix:` line in each case; the engine's or npm's own output comes above it, by design ("its output is above").

#### Still open

- **Podman:** unit cases added 2026-11-23 (daemon-down wording of Podman 5, short-name refusal, volume that exists, `--connection`, no gVisor). Real run on one case: `Apple-Actions/import-codesign-certs` with `container.engine: "podman"` (Podman 5.6.1, `podman machine`, arm64) gave the same 210 verdicts as Docker (120 Killed, 10 Survived, 80 NoCoverage), 12.2 s then 2.3 s. Only that case; the others ran on Docker. Real error lines on 2026-11-24 (Podman 5.6.1, oxmutate 2.18.4): socket down, short-name refusal and the default image (see the table); the machine was started for them and stopped again, and its images, volume and registries file were put back.
- **GitHub Actions:** blocked by `D-20261101-no-mutation-in-gha` (the owner, 2026-11-01: "No oxmutate in GHA"; every mutating step left Actions). No workflow was written. Needs the owner: either amend the decision for a container-mode smoke run, or accept item 5 as macOS and Linux locally only.
- **Corpus on the release:** the engine-side messages (†, R20, R21, R22) run inside the container only once published; until then the corpus needs `--candidate-dist`.

## Remaining work, in order (the owner, 2026-11-19: "implement all the remaining intents")

Two heavy agents at a time (this machine's limit); each item lands as its own PR with `ab.mjs`
and, for speed, `bench/container.mjs --compare` numbers.

|   # | Item                                                                                                                                                                                                                                                    | Intent                              | State                                                                                                                                                                                                                                                                                                                              |
| --: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | Confirm survivors in live workers                                                                                                                                                                                                                       | x2 WS1                              | PR #1668: 1.53x on ufo+defu+gen, every verdict equal                                                                                                                                                                                                                                                                               |
|   2 | Flaky re-runs scoped; dry-run limits that count instrumentation                                                                                                                                                                                         | x2 WS2                              | merged (#1667); container pathe compare owed                                                                                                                                                                                                                                                                                       |
|  2a | A dry-run `beforeAll` that times out turns its tests' mutants NoCoverage with exit 0: make it an error naming the hook. Move `flakyCandidates` into a pure module, so the pre-push gate mutates it (`coordinator.ts` is in `TESTED_IN_ANOTHER_PROCESS`) | found by #1667                      | running, with ufo's watchdog stop (8.8 s of its 15 s)                                                                                                                                                                                                                                                                              |
|  2b | `pathe` `_glob.ts:178:59`, `:279:20` flip Killed/Survived between full runs (warm pollution restarts), on 2.9.0 too                                                                                                                                     | found by #1667                      | queued                                                                                                                                                                                                                                                                                                                             |
|   3 | Release PR: daemon message, run guard, README; then registry auth; then the four gaps above                                                                                                                                                             | container DoD 1, 2, 4, 6            | running                                                                                                                                                                                                                                                                                                                            |
|   4 | Warm units: pollution handled in the worker, a worker that outlives its unit                                                                                                                                                                            | x2 WS3, fastest `1.3`, `1.5`        | queued                                                                                                                                                                                                                                                                                                                             |
|   5 | Container overhead: sync, start-up, copy-back                                                                                                                                                                                                           | x2 WS4                              | queued                                                                                                                                                                                                                                                                                                                             |
|   6 | Corpus: Yarn 2+, a workspace monorepo, a private registry (a local registry container), Bun's error; Podman; a GitHub Actions run                                                                                                                       | container DoD 1, 5; container R1–R7 | PR test/oxmutate-container-corpus: Docker cases checked on real repositories (see above); Podman: one real corpus case, plus the real socket-down and short-name lines (2026-11-24); full-disk line: real on Docker (2026-11-24, 24 MiB volume), unit-tested for Podman; GitHub Actions blocked by `D-20261101-no-mutation-in-gha` |
|   7 | Static: run a static mutant only where its value is read; drop mutants that compile the same                                                                                                                                                            | fastest `2.4`, `2.3`                | queued                                                                                                                                                                                                                                                                                                                             |
|   8 | Incremental: report reuse; keep the dry run's coverage                                                                                                                                                                                                  | fastest `3.1`, `3.3` (`F5`)         | queued                                                                                                                                                                                                                                                                                                                             |
|   9 | Governor: every free core when idle; memory per worker and in total                                                                                                                                                                                     | fastest `4.2`, `4.3` (`G3`, `G4`)   | queued                                                                                                                                                                                                                                                                                                                             |
|  10 | Stryker head-to-head on compat-oracle, same graded set                                                                                                                                                                                                  | fastest `F7`                        | queued, needs a quiet machine                                                                                                                                                                                                                                                                                                      |
|  11 | Jest behind the runner interface; agreement and speed against Stryker's jest-runner                                                                                                                                                                     | fastest `J1`–`J3`                   | queued                                                                                                                                                                                                                                                                                                                             |
|  12 | Item 5 of the earlier list: Sophos re-measured on the final build; release                                                                                                                                                                              | x2, container                       | last                                                                                                                                                                                                                                                                                                                               |

Then the other open intents (audited 2026-11-19 against `origin/main`: code landed everywhere, the
missing parts are readings and floors):

|   # | Item                                                                                                                                                              | Intent                                                           | State            |
| --: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------- | :--------------- |
|  13 | First mutation reading for `apicontract` and `validator` (both `unmeasured` in `mutation-ratchets.json`); unblocks every "mutation floor" criterion               | apicontract lanes, validator                                     | queued           |
|  14 | `gen-command`, `kit`: coverage and mutant proofs, then "criteria met, unpublished"                                                                                | apicontract-gen-command, -kit                                    | queued           |
|  15 | Readings: `consumers.ts` runs for clients/servers (N2, N3), the agents harness (`tools/list`), the extract round trip (B1, B5), `gen validator` on bench payloads | apicontract-clients, -servers, -agents, -extract, -gen-validator | queued           |
|  16 | Corpora: ≥10 MCP snapshots, ≥20 real documents per adapter, 50 Swagger 2.0; diff agreement with oasdiff and planted breaks (`D1`–`D3`, `D6`)                      | apicontract-corpus, -inputs, -diff                               | queued           |
|  17 | Types G1 (43/61 → 61/61), G2, G3                                                                                                                                  | apicontract-types, apicontract SC1                               | queued           |
|  18 | Validator readings Z2, Z6, Z8–Z10, Z15, Z16; then the lagging rows Z11–Z14                                                                                        | validator                                                        | queued           |
|  19 | burgee-on-oxc criteria 2–3 (refusal and build-tool measurements)                                                                                                  | burgee-on-oxc                                                    | queued           |
|   — | npm-search: re-read rank after 2026-11-25. Read 2026-11-25: the four within-reach misses stand                                                                    | npm-search                                                       | read; reopened   |
|   — | apicontract's name, first publish, the offer to openapi-typescript                                                                                                | apicontract                                                      | the owner's call |
