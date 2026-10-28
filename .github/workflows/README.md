# `.github/workflows/` — CI / CD

Ported from `ofri-peretz/eslint`. Every workflow is checked by `npm run lint:workflows`
(top-level `permissions`, per-job `timeout-minutes`, `concurrency` on PR triggers,
Node from `.nvmrc`, npm cache).

## Gates (required checks on `main`)

| Workflow | Check name | When |
| :-- | :-- | :-- |
| [`quality.yml`](./quality.yml) | `Quality Gate` | every PR push, push to main — lint, markdown, workflow conventions, lockfile |
| [`quality-full.yml`](./quality-full.yml) | `Quality (Full) Gate` | non-draft PRs, `run-full-ci` label, push to main, weekly — test, build, typecheck, and each changed package's coverage thresholds; on a PR, `test` runs the repository's locks in full and only the affected workspaces' suites (`scripts/affected.mts`) |
| [`claude-code-review.yml`](./claude-code-review.yml) | `review` | non-draft PRs; green no-op until `CLAUDE_CODE_OAUTH_TOKEN` exists, and on a queue entry or a dispatched run |

## Release loop

| Workflow | Role |
| :-- | :-- |
| [`changesets-pr.yml`](./changesets-pr.yml) | PR: `Changeset present` — a hard gate: a PR that changes `packages/*/src` or a `package.json` and adds no changeset fails, unless labelled `skip-changeset` — or opened by Dependabot and moving only `devDependencies` in each package manifest. Main: opens / refreshes the "Version Packages" PR with the release App's token, else `RELEASE_BOT_PAT`, else `GITHUB_TOKEN` — and under `GITHUB_TOKEN` it dispatches every required-check workflow on the PR branch, mirrors each result onto the head commit as a status, then merges and dispatches the post-merge runs itself (`checks`, `land`) |
| [`release.yml`](./release.yml) | Push to main (or dispatched by `land`): detect version diff vs npm, ordered dependencies-first by `scripts/release-order.mts` → build, and wait for `Quality Gate` + `Quality (Full) Gate` to pass on the same commit → one job publishes in that order (each package waits until its in-family dependencies are on npm) through npm trusted publishing (OIDC, no npm token — D-154) with provenance, tag, GitHub Release whose notes are that version's CHANGELOG section. When the plan carries oxmutate or an `oxmutate-<platform>` package (or on a dry run), `native` calls `oxmutate-native.yml` beside build and verify. oxmutate 0.1 bundles the six cores from its artifacts as `binding/oxmutate.<tag>.node`, and the loop refuses it without all six; the platform packages stay `private` until their names exist on npm, then publish first, with no tag or Release of their own, and oxmutate's published manifest gains `optionalDependencies` naming them ([`packages/oxmutate/RELEASING.md`](../../packages/oxmutate/RELEASING.md)) |

The Version PR loop is continuous: every push to main that carries a changeset refreshes the one
open Version PR, and it merges as soon as its required checks are green. Each workflow that reports
a required check also takes `workflow_dispatch:` — `npm run lint:workflows` fails if one does not, or
if `changesets-pr.yml`'s `checks` matrix has no row for it.

On a pull request, `compat.yml`'s `matrix` and `floor` cells and `quality-full.yml`'s `test` and
`coverage` run only the affected packages: each one the PR changed and each that depends on one,
computed once by `scripts/affected.mts` (D-20261012-ci-affected-pr-lanes). Root changes (any
root-level file, `.github/`, `scripts/`, a package manifest) select everything, as do a push to
main, the merge queue, the weekly scan, a dispatch and the `run-full-ci` label. A cell with nothing
to run still starts and passes in one step. `npm run lint:workflows` holds the lanes to the script.

## SDLC loop (Stage 4 and Stage 6)

| Workflow | Role |
| :-- | :-- |
| [`evals.yml`](./evals.yml) | PRs touching agent-facing docs, weekly: layer 1 link/script/floor-id checks; layer 2 task evals when a credential exists |
| [`control-bands.yml`](./control-bands.yml) | Weekly: records observations, evaluates Western Electric rules, opens an intent PR on a 2σ+ breach |
| [`models.yml`](./models.yml) | `.qnt` or `packages/closeout/src` changes: every Quint model holds its `safety` invariant over 20k simulated traces; open questions pinned as expected violations ([`JEV-AND-QUINT.md`](../../.sdlc/JEV-AND-QUINT.md)) |

## oxmutate

| Workflow | Role |
| :-- | :-- |
| [`oxmutate-bench.yml`](./oxmutate-bench.yml) | Dispatch only: Stryker and oxmutate on the same burgee packages, one cell per package, on a runner no other job shares; every metric one pair answers (`packages/oxmutate/bench/metrics.mjs`) in the run summary. Laptop wall-clock is not published (`.sdlc/intents/oxmutate/metrics.md`) |
| [`oxmutate-native.yml`](./oxmutate-native.yml) | Called by `release.yml`, or dispatched alone (builds, publishes nothing): one `oxmutate.node` per `packages/oxmutate/npm/<platform>` — macOS 14 for both darwin targets (x64 cross-compiled, header-checked), Ubuntu 22.04 x64 and arm64 for glibc, musl via `x86_64-unknown-linux-musl` + musl-tools and loaded in `node:<.nvmrc>-alpine`, Windows for msvc. Each leg checks the binary's header, `process.dlopen`s it and calls `nativeVersion()` where the runner can, and uploads `oxmutate-native-<platform>`, which `release.yml` places in oxmutate's `binding/`. `scripts/oxmutate-platforms-lock.test.ts` holds the matrix to the directories |

## Security

| Workflow | Role |
| :-- | :-- |
| [`codeql.yml`](./codeql.yml) | CodeQL on the promote gate and weekly |
| [`scorecard.yml`](./scorecard.yml) | OpenSSF Scorecard on push to main and weekly; SARIF to Code scanning, results published so the README badge resolves |

## Dependencies

| Workflow | Role |
| :-- | :-- |
| [`dependabot-automerge.yml`](./dependabot-automerge.yml) | Dependabot PRs (`pull_request_target`, never checks out the PR): turns on `--auto --squash` only when every updated dependency is a semver patch or minor and none is `direct:production` (GitHub Actions bumps are exempt from that type test). The required checks still gate the merge. On a push that makes the PR stop qualifying, it turns off the auto-merge it had turned on. Uses the release credential chain, else `GITHUB_TOKEN` with a warning |

## Coverage

| Workflow | Role |
| :-- | :-- |
| [`codecov.yml`](./codecov.yml) | Monday 06:00 UTC and on demand: one workspace-wide `vitest --coverage` run, uploaded once and split per package by root `codecov.yml`'s components. Reports only; the thresholds gate PRs in `quality-full.yml`'s `coverage` job |

Secrets: none for npm — `release.yml` publishes through each package's npm trusted publisher (OIDC),
and `trusted-publishing-lock.test.ts` refuses an npm token in any workflow. `CLAUDE_CODE_OAUTH_TOKEN` (optional), `RELEASE_APP_PRIVATE_KEY` with the repo *variable*
`RELEASE_APP_ID` (preferred release credential: a GitHub App installation token, so the Version
PR raises its own checks), `RELEASE_BOT_PAT` (the older alternative; also lets the Version PR
self-approve) — with neither, the `GITHUB_TOKEN` fallback above runs and warns, `CODECOV_TOKEN` (required by the weekly coverage run — without it that
run fails, which is the point: a silent no-op is a green tick reporting nothing), `SCORECARD_REPO_TOKEN` (optional PAT with `admin:read` — only the
branch-protection check needs it). Repo settings and branch protection: `scripts/repo-settings.sh`.
