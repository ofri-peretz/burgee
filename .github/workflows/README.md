# `.github/workflows/` — CI / CD

Ported from `ofri-peretz/eslint`. Every workflow is checked by `npm run lint:workflows`
(top-level `permissions`, per-job `timeout-minutes`, `concurrency` on PR triggers,
Node from `.nvmrc`, npm cache).

## Gates (required checks on `main`)

| Workflow | Check name | When |
| :-- | :-- | :-- |
| [`quality.yml`](./quality.yml) | `Quality Gate` | every PR push, push to main — lint, markdown, workflow conventions, lockfile |
| [`quality-full.yml`](./quality-full.yml) | `Quality (Full) Gate` | non-draft PRs, `run-full-ci` label, push to main, weekly — test, build, typecheck, and each changed package's coverage thresholds; on a PR, `test` runs the repository's locks in full and only the affected workspaces' suites (`scripts/affected.mts`) |
| [`compat.yml`](./compat.yml) | `Ratchet · each host's suite against burgee`, `Node 24 · ubuntu-latest`, `Node 24 · macos-latest`, `Node 24 · windows-latest` | every PR, the merge queue, nightly — each host's own suite against burgee, below baseline fails; our suite on each OS |
| [`codeql.yml`](./codeql.yml) | `CodeQL` (reported by code scanning from the analyze job's upload) | non-draft PRs, the merge queue, push to main, weekly |
| [`changesets-pr.yml`](./changesets-pr.yml) | `Changeset present` | every PR, the merge queue, the Version PR fallback |
| [`completions.yml`](./completions.yml) | `bash, zsh, fish, pwsh complete the demo` | every PR, the merge queue, push to main |

The nine names are `REQUIRED_CHECKS` in [`scripts/required-checks.mts`](../../scripts/required-checks.mts),
held to branch protection by `scripts/required-checks-lock.test.ts`, which also holds that each is
produced on a pull request, in a merge-queue entry and by the Version PR fallback: a required check
that never reports blocks every merge. `review` (`claude-code-review.yml`) runs on PRs and is no
longer required.

## A label never starts a second run of a required check

`gh pr create --label skip-changeset` raises `opened` and one `labeled` per label in the same
second. A workflow that listed `labeled` started once per event, concurrency cancelled all but
one, and branch protection reads each required context from the newest check suite that carries
it, which on #1418 was the cancelled twin: BLOCKED, everything green. So no workflow that reports a
required check subscribes to `labeled`/`unlabeled`. A label applied at creation is in the `opened`
run; one changed later lands in [`pr-labels.yml`](./pr-labels.yml), which re-runs the PR's own
run of each workflow that reads it (`skip-changeset` → `changesets-pr.yml`; `run-full-ci` →
`quality-full.yml`, `compat.yml`, `codeql.yml`): a new attempt in the same check suite, never a
second suite. Each step that reads one of those labels reads it back live, since a re-run keeps
its event. A dispatch would not do: a `workflow_dispatch` suite is not among a PR's checks at all.
`bench.yml` keeps
`labeled` for `bench:agent` only; any other label's run runs no job, in a group of its own.
`scripts/pr-trigger-lock.test.ts` holds all of it.

## Heavy work runs over night

Heavy work does not run during CI/CD ([D-20261101-heavy-ci-runs-nightly](../../.sdlc/decisions/D-20261101-heavy-ci-runs-nightly.md)):
a pull request runs the gates, a push to `main` runs the two gates release waits for, and the rest
runs on a staggered nightly cron. A failed night opens an issue, or comments on the open one —
from [`nightly-report.yml`](./nightly-report.yml), which follows the nightly runs' completion on
`main`, so no pull request shows a reporter as a check.
`scripts/heavy-ci-nightly-lock.test.ts` holds it.

| UTC | Workflow | What | On a pull request instead |
| :-- | :-- | :-- | :-- |
| 03:00 daily | [`bench.yml`](./bench.yml) | B2 cold start, B3 compat suite, B4 weight, B5 runtime, reliability, the N10 floor; lands the night's observation on `chore/bench-series` | `gate`: B4 weight, reliability and the floor ratchet, `--check`ed |
| 03:30 daily | [`compat.yml`](./compat.yml) | the ratchet, the three Node 24 cells, the off-Linux controls, the six Node-floor published-suites cells | the ratchet and the three Node 24 cells (required); `run-full-ci` adds the rest |
| 05:40 Tue | [`bench.yml`](./bench.yml) | B1 agent cost (paid) | only with the `bench:agent` label |
| 06:20 Sat | [`evals.yml`](./evals.yml) | layer 2 task evals (paid) | never; layer 1 runs in `Quality Gate` |

## Mutation runs locally, never here

No workflow mutates ([D-20261101-no-mutation-in-gha](../../.sdlc/decisions/D-20261101-no-mutation-in-gha.md)):
the owner runs mutation on his machine and the results land as PRs. `mutation.yml` (the weekly
full run), `quality-full.yml`'s `Mutation (changed lines)` job and `oxmutate-bench.yml` (Stryker
beside oxmutate) were removed on 2026-11-01. `scripts/mutation-local-only-lock.test.ts` fails if a
step under `.github/` runs `scripts/mutation.ts`, either npm script below, the oxmutate bin, the
paired bench or Stryker, or sets `BURGEE_NIGHTLY` (the NIGHTLY_ONLY oxmutate cases, which compat.yml's `heavy-tests` ran until this change). Building oxmutate's native cores for a release (`oxmutate-native.yml`) and
running oxmutate's own unit suite in `test` are not mutation runs, and stay.

| When | Where | What |
| :-- | :-- | :-- |
| every push | pre-push (`lefthook.yml`) | `npm run mutation:changed`: the lines the branch changed against `origin/main`, the per-PR gate |
| 02:30 Sat, local time | launchd, `npm run mutation:weekly` | the NIGHTLY_ONLY test cases with `BURGEE_NIGHTLY=1`, then every package in `.sdlc/bands/mutation-ratchets.json` in full, one at a time, on a clean worktree of `origin/main`; `record`, then a `chore(workspace): record mutation scores` PR with auto-merge armed; exits 2 on a breached floor |
| on demand | `npx tsx packages/oxmutate/bench/burgee-pair.mts --package <pkg>` | Stryker and oxmutate on the same package, the same machine, back to back |

The weekly run's launchd agent is [`tools/launchd/dev.burgee.mutation-weekly.plist`](../../tools/launchd/dev.burgee.mutation-weekly.plist).
Install it once:

```sh
cp tools/launchd/dev.burgee.mutation-weekly.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/dev.burgee.mutation-weekly.plist
```

`npm run mutation:weekly -- --dry-run` prints every step without changing anything; its log is
`~/Library/Logs/burgee-mutation-weekly.log`.

## Release loop

| Workflow | Role |
| :-- | :-- |
| [`changesets-pr.yml`](./changesets-pr.yml) | PR: `Changeset present` — a hard gate: a PR that changes `packages/*/src` or a `package.json` and adds no changeset fails, unless labelled `skip-changeset` — or opened by Dependabot and moving only `devDependencies` in each package manifest. Main: opens / refreshes the "Version Packages" PR with the release App's token, else `RELEASE_BOT_PAT`, else `GITHUB_TOKEN` — and under `GITHUB_TOKEN` it dispatches every required-check workflow on the PR branch, mirrors each result onto the head commit as a status, then merges and dispatches the post-merge runs itself (`checks`, `land`) |
| [`release.yml`](./release.yml) | Push to main (or dispatched by `land`): detect version diff vs npm, ordered dependencies-first by `scripts/release-order.mts` → build, and wait for `Quality Gate` + `Quality (Full) Gate` to pass on the same commit → one job publishes in that order (each package waits until its in-family dependencies are on npm) through npm trusted publishing (OIDC, no npm token — D-154) with provenance, tag, GitHub Release whose notes are that version's CHANGELOG section. When the plan carries oxmutate or an `oxmutate-<platform>` package (or on a dry run), `native` calls `oxmutate-native.yml` beside build and verify. oxmutate 0.1 bundles the six cores from its artifacts as `binding/oxmutate.<tag>.node`, and the loop refuses it without all six; the platform packages stay `private` until their names exist on npm, then publish first, with no tag or Release of their own, and oxmutate's published manifest gains `optionalDependencies` naming them ([`packages/oxmutate/RELEASING.md`](../../packages/oxmutate/RELEASING.md)) |

The Version PR loop is continuous: every push to main that carries a changeset refreshes the one
open Version PR, and it merges as soon as its required checks are green. Each workflow that reports
a required check also takes `workflow_dispatch:` — `npm run lint:workflows` fails if one does not, or
if `changesets-pr.yml`'s `checks` matrix has no row for it. One row per workflow, dispatched once,
mirroring every required check that run reports (compat.yml's reports four). `CodeQL` is the one the
fallback cannot produce: code scanning creates it only from a `pull_request` analysis, and branch
protection pins it to code scanning's app, so a Version PR opened with GITHUB_TOKEN cannot merge
until the release App token or `RELEASE_BOT_PAT` is set.

On a pull request, `compat.yml`'s `matrix` cells (and its `floor` cells under `run-full-ci`)
and `quality-full.yml`'s `test` and `coverage` run only the affected packages: each one the PR changed and each that depends on one,
computed once by `scripts/affected.mts` (D-20261012-ci-affected-pr-lanes). Root changes (any
root-level file, `.github/`, `scripts/`, a package manifest) select everything, as do a push to
main, the merge queue, a scheduled run, a dispatch and the `run-full-ci` label. A cell with nothing
to run still starts and passes in one step. `npm run lint:workflows` holds the lanes to the script.

## SDLC loop (Stage 4 and Stage 6)

| Workflow | Role |
| :-- | :-- |
| [`evals.yml`](./evals.yml) | Weekly and on dispatch, never on a PR: layer 1 link/script/floor-id checks; layer 2 task evals when a credential exists. Layer 1 also runs on every PR inside `Quality Gate` |
| [`control-bands.yml`](./control-bands.yml) | Weekly: records observations, evaluates Western Electric rules, opens an intent PR on a 2σ+ breach |
| [`models.yml`](./models.yml) | `.qnt` or `packages/closeout/src` changes: every Quint model holds its `safety` invariant over 20k simulated traces; open questions pinned as expected violations ([`JEV-AND-QUINT.md`](../../.sdlc/JEV-AND-QUINT.md)) |

## oxmutate

| Workflow | Role |
| :-- | :-- |
| [`oxmutate-native.yml`](./oxmutate-native.yml) | Called by `release.yml`, or dispatched alone (builds, publishes nothing): one `oxmutate.node` per `packages/oxmutate/npm/<platform>` — macOS 14 for both darwin targets (x64 cross-compiled, header-checked), Ubuntu 22.04 x64 and arm64 for glibc, musl via `x86_64-unknown-linux-musl` built in `rust:<version>-alpine` and loaded in `node:<.nvmrc>-alpine`, Windows for msvc. Each leg checks the binary's header, `process.dlopen`s it and calls `nativeVersion()` where the runner can, and uploads `oxmutate-native-<platform>`, which `release.yml` places in oxmutate's `binding/`. `scripts/oxmutate-platforms-lock.test.ts` holds the matrix to the directories |

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
