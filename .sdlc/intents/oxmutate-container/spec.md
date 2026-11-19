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

## Not covered

- gVisor (`runtime: 'runsc'`) is passed through but was not run: it is not installed here.
- A daemon on another machine (`host: 'ssh://…'`) is the same calls as a context; only local
  daemons were measured.
- Private repositories under `source: 'git'` need credentials the container can use (`env`, or a
  `remote` with a token); oxmutate carries none of its own.
