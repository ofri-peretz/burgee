# Intent — `oxmutate-x2`: twice as fast in container mode, every verdict the same

**Status:** approved · **Opened:** 2026-11-19 · **Owner:** @ofri-peretz · **Parent:**
[`oxmutate-fastest`](../oxmutate-fastest/intent.md), [`oxmutate-container`](../oxmutate-container/intent.md)

---

## What is wanted

The owner's words, 2026-11-19: "improve ourself until we're getting to a point we are twice as fast
from what we're today, without any workarounds … understand where our bottlenecks are, understanding
that in corporate machines like ours we need to run in container mode", and "without compromising
quality".

1. A container-mode run of the benchmark corpus takes half the wall time it took with oxmutate
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
- The repository's rules hold: no new dependency, every changed line held by a test (the pre-push
  mutation gate), a fix proven by a check that fails without it.

## Success criteria

- `node packages/oxmutate/bench/container.mjs --compare <baseline-2.9.0>.json <candidate>.json`
  prints a total of 2.00x or more and "every verdict equal", on `ufo`, `pathe`, `defu` and `gen`.
- `node packages/oxmutate/bench/ab.mjs` against 2.9.0 exits 0.

## Where the time goes (2.9.0, container mode, 2026-11-19)

| Target | Mutants | Wall | Isolated runs | Of them | Warm | Static |
| :-- | --: | --: | --: | :-- | --: | --: |
| `ufo` | 1,091 | 17.3 s | 12.2 s (70%) | 100 survivor confirmations, 0 overturned | 3.1 s | 1.1 s |
| `pathe` | 1,090 | 699 s | 414 s (59%) | 416 flaky re-runs, 202 static, 112 confirmations | 239 s | 30 s |
| `defu` | 103 | 1.2 s | 0.3 s | 12 confirmations | 0.5 s | 0.1 s |

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

| Target | Mutants | Wall (median) | Dry run | Mutation | Static | Isolated | Digest |
| :-- | --: | --: | --: | --: | --: | --: | :-- |
| `ufo` | 1,091 | 17.0 s | 0.5 | 2.3 | 0.9 | 11.3 | `3c2eda7110e1635f` |
| `defu` | 103 | 2.8 s | 0.3 | 0.5 | 0.1 | 0.3 | `353adf3799cdce67` |
| `gen` | 1,980 | 6.1 s | 1.0 | 1.4 | 0.8 | 1.4 | `ab0fdc77f0ee373f` |
| `pathe` | 1,090 | 243.3 s (1 round) | 3.7 | 53.6 | 58.8 | 122.4 | `84d754320a74d10a` |

Every digest held across rounds. `pathe` swings with the machine's load (699 s at load 50+ earlier
the same day), so a candidate is measured right after a baseline re-run, not against this table.

## Definition of done (the owner, 2026-11-19)

"The container mode will work extremely well and be convenient for real world production usage."
Twice as fast is one part of it. Done means, each checked on a real repository, not a fixture:

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

| Use case | State | Where |
| :-- | :-- | :-- |
| Private registry (host's npm login) | in progress | release PR: `registryAuth`, `installEnv` |
| oxmutate not a dependency of the project (`npx oxmutate`) | **gap**: `npx --no oxmutate` fails inside | next: install the host's own version into the volume during the sync, keyed by version |
| `--since`, `--frozen-oracle` | done, unreleased | release PR: bases via `git archive` |
| Untracked, non-ignored files (a new config) | done | `git ls-files --cached --others --exclude-standard` |
| Ignored files the tests need (`.env.test`, generated fixtures) | **gap** | next: `include` globs, opt-in |
| npm, pnpm, Yarn 1 | done | `defaultInstall` |
| Yarn 2+ (`.yarnrc.yml`): install flag and its own auth | **gap**: `--frozen-lockfile`, home `.yarnrc.yml` not forwarded | next |
| Bun (`bun.lock`) | **gap**: no install chosen, the image has no Bun | next: a one-line error naming `image`/`install` |
| Docker not running, two runs on one repo | done | release PR |

### Checked on a real repository (`bench/container-corpus.mjs`, 2026-11-20, Docker Desktop, macOS)

Run with `{"container": true}` and nothing else, on repositories pinned by commit. The inside
oxmutate is the published 2.11.0; `--candidate-dist` lays this build's `dist` over it only where an
engine-side message was under test (marked †). Each row says what the case found.

| DoD item | Case (repo @ commit) | Result | Found, fixed |
| :-- | :-- | :-- | :-- |
| Yarn 1 | `acrazing/dpdm` @ `52ac8b8` | report: 1,187 mutants, exit 0, 349 s then 209 s on the final build (load 25–60) | **`EACCES` on the forwarded `~/.npmrc`** (mode 0600, no capability to read another uid's file): R18 |
| pnpm workspace | `twoslashes/twoslash` @ `e88c870`, from `packages/twoslash-remote` | report: 295 mutants, exit 0, 35 s, then 18.6 s on the final build | none |
| Yarn 2+ | `Apple-Actions/import-codesign-certs` @ `2429e2f` | report: 210 mutants, exit 0, 8 s then 2.6 s on the final build; on Podman 12.2 s then 2.3 s, same verdicts | none |
| Yarn 2+ whose tests need a build | `electron/asar` @ `8257ba9` | zero-config fails in the dry run with one line naming `container.install` (†); with `install: "… && yarn build"` a report, 1,237 mutants, exit 0, 1,900 s | **a symlink to a directory was not sent** (27 failures): R19; **a stale report returned after a failed run**: R20; **`pool: 'forks'` overridden by threads** (`process.chdir`): R21; its dry-run line did not name the build: R22 |
| Yarn 2+ workspace, older Vitest | `puzzmo-com/xd-crossword-tools` @ `930437b` (Vitest 3.1) | fails with one line: "Vitest said options.minThreads and options.maxThreads must not conflict … upgrade vitest" (†) | **"the dry run ran no tests" was a misreport**; R22 |
| Tests that call the network | `electron/get` @ `9b4a554` (its suite fails with the network on too) | fails with one line naming `container.network` (†) | the line named no fix; R22 |
| Private registry | Verdaccio on a Docker network (`oxmutate-corpus`), `@corp/greeter` needs a token; host npmrc a temp file with `${NODE_AUTH_TOKEN}` | install succeeds (shared cache off, so the token is asked for), 7 mutants, exit 0; a test that checks its `NODE_AUTH_TOKEN`, `npm_config_userconfig`, `~/.npmrc`, `/tmp/oxmutate-npmrc` and token-shaped variables passes; the control (`container.env: ["NODE_AUTH_TOKEN"]`) fails that test; without the token the install fails with the 401/403/404 line | none |

Not a pass: `electron/update-electron-app` and `electron/get` fail their own suites on a plain
`node:22` with the network on (Windows-only tests; network downloads), so neither is a case of
oxmutate's.

#### Every failure names its fix (captured 2026-11-20)

| Setup | Line |
| :-- | :-- |
| `container.host: tcp://127.0.0.1:1` | `oxmutate: docker could not reach the daemon at tcp://127.0.0.1:1 (container.host). fix: check that it is running and reachable from here (its address, ssh or tls), or remove it to use the local daemon` (was: "daemon is not running … start Docker Desktop") |
| daemon down (`DOCKER_HOST=unix:///nonexistent/docker.sock`; Docker itself was not stopped, others share it) | `oxmutate: docker is installed but its daemon is not running. fix: start Docker Desktop (or \`podman machine start\`), or set container.engine` |
| install fails (a dependency no registry has) | `oxmutate: the sync into the container or its install failed (exit 1); its output is above. fix: for "out of date" or "frozen", update the lockfile on the host … commit it; for 401, 403 or 404, log in to the registry on the host …; otherwise set container.install, or container.image …` (was: "set container.install, or container.image") |
| lockfile out of date | the same line; npm's own `npm ci` message is above it |
| `bun.lock`, no `install` | `oxmutate: bun.lock is bun's, and the container installs with npm, pnpm or yarn. fix: set container.image to one with bun (such as oven/bun) and container.install (such as bun install --frozen-lockfile)` |
| no space on the volume | not checked |

#### Still open

- **Podman:** checked on one case: `Apple-Actions/import-codesign-certs` with `container.engine: "podman"` (Podman 5.6.1, `podman machine`, arm64) gave the same 210 verdicts as Docker (120 Killed, 10 Survived, 80 NoCoverage), 12.2 s then 2.3 s. Only that case; the others ran on Docker.
- **GitHub Actions:** blocked by `D-20261101-no-mutation-in-gha` (the owner, 2026-11-01: "No oxmutate in GHA"; every mutating step left Actions). No workflow was written. Needs the owner: either amend the decision for a container-mode smoke run, or accept item 5 as macOS and Linux locally only.
- **Corpus on the release:** the engine-side messages (†, R20, R21, R22) run inside the container only once published; until then the corpus needs `--candidate-dist`.

## Remaining work, in order (the owner, 2026-11-19: "implement all the remaining intents")

Two heavy agents at a time (this machine's limit); each item lands as its own PR with `ab.mjs`
and, for speed, `bench/container.mjs --compare` numbers.

| # | Item | Intent | State |
| --: | :-- | :-- | :-- |
| 1 | Confirm survivors in live workers | x2 WS1 | PR #1668: 1.53x on ufo+defu+gen, every verdict equal |
| 2 | Flaky re-runs scoped; dry-run limits that count instrumentation | x2 WS2 | merged (#1667); container pathe compare owed |
| 2a | A dry-run `beforeAll` that times out turns its tests' mutants NoCoverage with exit 0: make it an error naming the hook. Move `flakyCandidates` into a pure module, so the pre-push gate mutates it (`coordinator.ts` is in `TESTED_IN_ANOTHER_PROCESS`) | found by #1667 | running, with ufo's watchdog stop (8.8 s of its 15 s) |
| 2b | `pathe` `_glob.ts:178:59`, `:279:20` flip Killed/Survived between full runs (warm pollution restarts), on 2.9.0 too | found by #1667 | queued |
| 3 | Release PR: daemon message, run guard, README; then registry auth; then the four gaps above | container DoD 1, 2, 4, 6 | running |
| 4 | Warm units: pollution handled in the worker, a worker that outlives its unit | x2 WS3, fastest `1.3`, `1.5` | queued |
| 5 | Container overhead: sync, start-up, copy-back | x2 WS4 | queued |
| 6 | Corpus: Yarn 2+, a workspace monorepo, a private registry (a local registry container), Bun's error; Podman; a GitHub Actions run | container DoD 1, 5; container R1–R7 | PR test/oxmutate-container-corpus: Docker cases checked on real repositories (see above); Podman checked on one case (same verdicts as Docker); GitHub Actions blocked by `D-20261101-no-mutation-in-gha` |
| 7 | Static: run a static mutant only where its value is read; drop mutants that compile the same | fastest `2.4`, `2.3` | queued |
| 8 | Incremental: report reuse; keep the dry run's coverage | fastest `3.1`, `3.3` (`F5`) | queued |
| 9 | Governor: every free core when idle; memory per worker and in total | fastest `4.2`, `4.3` (`G3`, `G4`) | queued |
| 10 | Stryker head-to-head on compat-oracle, same graded set | fastest `F7` | queued, needs a quiet machine |
| 11 | Jest behind the runner interface; agreement and speed against Stryker's jest-runner | fastest `J1`–`J3` | queued |
| 12 | Item 5 of the earlier list: Sophos re-measured on the final build; release | x2, container | last |

Then the other open intents (audited 2026-11-19 against `origin/main`: code landed everywhere, the
missing parts are readings and floors):

| # | Item | Intent | State |
| --: | :-- | :-- | :-- |
| 13 | First mutation reading for `apicontract` and `validator` (both `unmeasured` in `mutation-ratchets.json`); unblocks every "mutation floor" criterion | apicontract lanes, validator | queued |
| 14 | `gen-command`, `kit`: coverage and mutant proofs, then "criteria met, unpublished" | apicontract-gen-command, -kit | queued |
| 15 | Readings: `consumers.ts` runs for clients/servers (N2, N3), the agents harness (`tools/list`), the extract round trip (B1, B5), `gen validator` on bench payloads | apicontract-clients, -servers, -agents, -extract, -gen-validator | queued |
| 16 | Corpora: ≥10 MCP snapshots, ≥20 real documents per adapter, 50 Swagger 2.0; diff agreement with oasdiff and planted breaks (`D1`–`D3`, `D6`) | apicontract-corpus, -inputs, -diff | queued |
| 17 | Types G1 (43/61 → 61/61), G2, G3 | apicontract-types, apicontract SC1 | queued |
| 18 | Validator readings Z2, Z6, Z8–Z10, Z15, Z16; then the lagging rows Z11–Z14 | validator | queued |
| 19 | burgee-on-oxc criteria 2–3 (refusal and build-tool measurements) | burgee-on-oxc | queued |
| — | npm-search: re-read rank after 2026-11-25 | npm-search | time-gated |
| — | apicontract's name, first publish, the offer to openapi-typescript | apicontract | the owner's call |
