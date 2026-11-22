# Spec — oxmutate `container`: the host as a black box

**Written:** 2026-11-19, by the session building oxmutate's container mode. **Status: accepted** by
the owner the same day ("lets execute the plan"), after this direction was stated: "run mutation
testing in all options docker allows, but specifically in a decoupled way from the main machine, so
it will be a blackbox for the machine." The first version (PR #1658) mounted a host directory and
exposed few of Docker's options; this is what replaced it.

## Requirements

- **R1 — nothing of the host is mounted.** The source goes in, and the kept files come out, through
  `<engine> cp` on created containers. _Check:_ `containerPlan` emits no `-v <host path>`
  (`container.test.ts`, "mounts nothing of the host").
- **R2 — the engine may be anywhere.** `context` and `host` reach every engine call, Docker's or
  Podman's spelling. _Check:_ "sends every engine call to the context and the host it names";
  measured on Docker Desktop (`--context desktop-linux`) and Podman 5.6.1 (2026-11-19).
- **R3 — the host may read no project file.** `source: 'git'` sends only a commit and a remote; the
  container fetches. _Check:_ "with source git, sends no file"; measured through a host
  `git daemon`: an uncommitted edit on the host is absent from the container's source.
- **R4 — the host needs no install of the project.** The hand-off reads `oxmutate.config.*` or the
  flags; a Vite config is read only when present and importable. _Check:_ a project configured only
  in `vite.config.ts`, with no `node_modules` on the host, ran under `--container` (2026-11-19).
- **R5 — every option Docker has is reachable.** Named keys for the common ones (`runtime`,
  `readOnly`, `user`, `platform`, `pull`, `pidsLimit`, `cpus`, `memory`, `network`, `env`) reach the
  containers they apply to; `args` and `runArgs` pass the rest. _Check:_ "gives every container every
  option set".
- **R6 — least privilege by default.** All capabilities dropped, `no-new-privileges`, no network for
  the run, every container and volume labelled. _Check:_ "labels the volume, hardens every
  container"; measured: `fetch` from the run is refused, and allowed with `network: 'bridge'`.
- **R7 — the oxmutate inside may be another version.** The container flags are not forwarded.
  _Check:_ "hands the oxmutate inside its arguments without the container flags"; it was found when
  the project's 2.8.0 refused `--container`.

## Measured, 2026-11-19 (Docker Desktop and Podman on one Mac)

| Run                                             | Exit | Wall          |
| :---------------------------------------------- | ---: | :------------ |
| Docker, copy, install                           |    0 | 10 s          |
| Docker, copy, warm                              |    0 | 2 s           |
| Vite-only project, no host `node_modules`       |    0 | 2 s           |
| `context`, `readOnly`, `pidsLimit`, `ephemeral` |    0 | 8 s (install) |
| `source: 'git'`, slim image (no git)            |    3 | 0 s, the fix  |
| `source: 'git'`, full image, then warm          |    0 | 9 s, 1 s      |
| Podman, install, then warm                      |    0 | 14 s, 2 s     |

## Second round, 2026-11-19

Added after the first release, from what the 2.9.0 runs and a Sophos measurement showed (on one
Mac, the host run held the endpoint scanner at 384–445% CPU while the same run in a container left
it at its idle 61–160%).

- **R8 — on for every project, not per project.** `OXMUTATE_CONTAINER` (or
  `~/.config/oxmutate/config.json`) is the machine's default; a project's own `container`, `false`
  included, wins. burgee's own changed-lines lane sets `container: false`, since it runs the
  checkout's own build. _Check:_ "takes the machine default …"; `mutation-lock.test.ts`; measured:
  `OXMUTATE_CONTAINER=1` ran a project that sets nothing in a container.
- **R9 — only what changed is sent.** The host keeps, per volume, a token and each file's size and
  modification time; a run sends the delta, a volume that is not the one last synced refuses it and
  gets everything, and an unchanged repository has no sync container. _Check:_ "the next run sends
  only what changed …", "sends everything again when the volume refuses the delta …"; measured: the
  second run 1.7 s, a one-file edit a one-file delta, two deleted files gone from the volume.
- **R10 — one package cache for every repository.** npm, pnpm and yarn caches live in the shared
  `oxmutate-cache` volume, mounted in the sync alone. _Check:_ "labels the volumes …"; measured: a
  second repository's first run 2.8 s against the first's 10.7 s.
- **R11 — `--since` and `--frozen-oracle` inside.** Each ref goes in as its tree (`git archive`) and
  becomes a tag the run names. _Check:_ "turns each ref the run names into a commit and a tag …";
  measured: `--since HEAD` scored the 10 mutants on the changed line, a full run 50.
- **R12 — gVisor when Docker has it**, and **`oxmutate prune`** for everything container mode made.
  _Check:_ "runs on gVisor when Docker has it", "prune …"; measured: `prune` removed the three
  volumes the runs above left.
- **R13 — one run on a volume at a time, and a stopped daemon named.** Each sync, run and copy-back
  container carries `dev.oxmutate.volume=<volume>`; a second run polls for it every 2 s, says once
  that it waits, and fails with a fix line after 10 minutes. An engine call that fails because the
  daemon is unreachable says so. _Check:_ "two runs on one volume", "when the engine cannot run".
- **R14 — the install gets the registry auth, the tests do not.** The host's npm user config
  (`$npm_config_userconfig`, else `~/.npmrc`) and `~/.yarnrc.yml` are copied into the sync container
  alone (`/tmp/oxmutate-npmrc`, and a HOME of its own at `/tmp/oxmutate-home`), never into the volume,
  with each `${NAME}` they name passed as `-e NAME`; `installEnv` is `env` for the sync alone.
  `registryAuth: false` turns it off; with `host` it is off unless set, and the run says so once.
  _Check:_ "what the install gets" — the run's arguments never carry the files or the variables.
- **R15 — oxmutate need not be a dependency.** With `command` unset the sync installs the host's own
  version into `/w/.oxmutate/<version>` once, and the run runs it, so the inside reads the argv the
  host wrote; the version is in the install key. Offline, the sync fails naming `container.command`
  and `container.install`. _Check:_ "installs the host's own oxmutate …"; measured: on Docker,
  `npm install --prefix … oxmutate@2.9.0` then `--version` printed 2.9.0, and with `--network=none`
  the line exited 5.
- **R16 — ignored files the tests need.** `include` names paths or globs (git pathspecs with glob
  magic) sent with the git files although git ignores them, `.env.test` among them, which then
  reach the tests by design. _Check:_ "sends the ignored files include names …".
- **R17 — every package manager is chosen right or refused.** Yarn 2 and later (`.yarnrc.yml`, or
  `packageManager: yarn@2+`) installs with `yarn install --immutable`; a bun lockfile with no
  `install` fails before anything is synced, naming `container.image` and `container.install`.
  _Check:_ "installs Yarn 2 and later …", "refuses a bun project …".

- **R18 — the forwarded auth files are readable inside.** `~/.npmrc` is mode 0600 and `docker cp`
  keeps the host's uid; the container drops every capability, so root cannot read it
  (`EACCES: permission denied, open '/tmp/oxmutate-npmrc'`, Yarn 1 on `dpdm`, 2026-11-20). The files
  are staged mode 0644 in the run's own 0700 directory and copied from there. _Check:_ "stages the
  forwarded files readable …" (fails without the chmod).
- **R19 — a symbolic link is sent as the link.** `signatures` used `stat`, so a link to a directory
  failed `isFile()` and a dangling link was dropped (`Current -> A` in `electron/asar`: 27 tests
  failed in the dry run). It uses `lstat`. _Check:_ "signs a symbolic link as the file it is …".
- **R20 — a failed run returns no report.** The volume keeps the last run's `reports/`; a run that
  exited with anything but 0 or 1 failed before writing one, and its copy-back returned the old one
  as fresh. _Check:_ "copies the reports back after exit 0 or 1, never after a run that failed".
- **R21 — the project's pool is kept.** The server forced `pool: 'threads'`; a project whose Vitest
  config asks for `forks` (tests that call `process.chdir`) failed its dry run. `declaredPool` reads
  the config with the project's own Vite. _Check:_ `declared-pool.test.ts`, and the e2e case "keeps
  the pool the project's Vitest config asks for" (fails with threads forced).
- **R22 — a dry run that cannot proceed says why, and the fix.** A dry run that ran nothing names
  what Vitest returned (a Vitest older than 4.1 raised `minThreads and maxThreads must not
conflict`: "ran no tests" was a misreport); failing tests quote their first error; in a container,
  a test that reached the network names `container.network`, tests that import build output the
  checkout lacks name `container.install` and `container.include`; a failed install names the
  lockfile and the registry login; an unreachable `container.host` or `container.context` names it
  rather than Docker Desktop. _Check:_ `dry-failure.test.ts`, "names the remote daemon …", "stops
  before the run when the sync … fails".

## Rejected

- **A host directory mounted at `/io`** (the first version in #1658): Docker Desktop and Podman
  machines share only some host paths, a remote daemon none, and it is the host's filesystem in the
  container. `<engine> cp` replaced it.
- **Streaming the archive over stdin**: `bellpull`, which every subprocess goes through, takes no
  stdin and decodes stdout as text. A tar file and `<engine> cp` need neither.
- **An oxmutate image of our own**: an image would be a second version to keep in step and a
  service to run. The sync installs the host's own version from the registry instead (R15).
- **The project's own oxmutate first, when it has one**: its version may not know a flag the host
  wrote into the argv, so the host's version runs unless `command` says otherwise.

## Not covered

- gVisor is detected and passed through but was not run: it is not installed here.
- A daemon on another machine (`host: 'ssh://…'`) is the same calls as a context; only local
  daemons were measured.
- Private repositories under `source: 'git'` need credentials the container can use (`env`, or a
  `remote` with a token); oxmutate carries none of its own.
