# `.github/workflows/` — CI / CD

Ported from `ofri-peretz/eslint`. Every workflow is checked by `npm run lint:workflows`
(top-level `permissions`, per-job `timeout-minutes`, `concurrency` on PR triggers,
Node from `.nvmrc`, npm cache).

## Gates (required checks on `main`)

| Workflow | Check name | When |
| :-- | :-- | :-- |
| [`quality.yml`](./quality.yml) | `Quality Gate` | every PR push, push to main — lint, markdown, workflow conventions, lockfile |
| [`quality-full.yml`](./quality-full.yml) | `Quality (Full) Gate` | non-draft PRs, `run-full-ci` label, push to main, weekly — test, build, typecheck |
| [`claude-code-review.yml`](./claude-code-review.yml) | `review` | non-draft PRs; green no-op until `CLAUDE_CODE_OAUTH_TOKEN` exists, and on a queue entry or a dispatched run |

## Release loop

| Workflow | Role |
| :-- | :-- |
| [`changesets-pr.yml`](./changesets-pr.yml) | PR: `Changeset present` — a hard gate: a PR that changes `packages/*/src` or a `package.json` and adds no changeset fails, unless labelled `skip-changeset`. Main: opens / refreshes the "Version Packages" PR with the release App's token, else `RELEASE_BOT_PAT`, else `GITHUB_TOKEN` — and under `GITHUB_TOKEN` it dispatches every required-check workflow on the PR branch, mirrors each result onto the head commit as a status, then merges and dispatches the post-merge runs itself (`checks`, `land`) |
| [`release.yml`](./release.yml) | Push to main (or dispatched by `land`): detect version diff vs npm → build, and wait for `Quality Gate` + `Quality (Full) Gate` to pass on the same commit → publish with provenance, tag, GitHub Release whose notes are that version's CHANGELOG section |

The Version PR loop is continuous: every push to main that carries a changeset refreshes the one
open Version PR, and it merges as soon as its required checks are green. Each workflow that reports
a required check also takes `workflow_dispatch:` — `npm run lint:workflows` fails if one does not, or
if `changesets-pr.yml`'s `checks` matrix has no row for it.

## SDLC loop (Stage 4 and Stage 6)

| Workflow | Role |
| :-- | :-- |
| [`evals.yml`](./evals.yml) | PRs touching agent-facing docs, weekly: layer 1 link/script/floor-id checks; layer 2 task evals when a credential exists |
| [`control-bands.yml`](./control-bands.yml) | Weekly: records observations, evaluates Western Electric rules, opens an intent PR on a 2σ+ breach |

## Security

| Workflow | Role |
| :-- | :-- |
| [`codeql.yml`](./codeql.yml) | CodeQL on the promote gate and weekly |
| [`scorecard.yml`](./scorecard.yml) | OpenSSF Scorecard on push to main and weekly; SARIF to Code scanning, results published so the README badge resolves |

## Coverage

| Workflow | Role |
| :-- | :-- |
| [`codecov.yml`](./codecov.yml) | Monday 06:00 UTC and on demand — never in CI: one workspace-wide `vitest --coverage` run, uploaded once and split per package by root `codecov.yml`'s components. Reports; does not gate |

Secrets: `NPM_TOKEN` (until Trusted Publishing is configured per package),
`CLAUDE_CODE_OAUTH_TOKEN` (optional), `RELEASE_APP_PRIVATE_KEY` with the repo *variable*
`RELEASE_APP_ID` (preferred release credential: a GitHub App installation token, so the Version
PR raises its own checks), `RELEASE_BOT_PAT` (the older alternative; also lets the Version PR
self-approve) — with neither, the `GITHUB_TOKEN` fallback above runs and warns, `CODECOV_TOKEN` (required by the weekly coverage run — without it that
run fails, which is the point: a silent no-op is a green tick reporting nothing), `SCORECARD_REPO_TOKEN` (optional PAT with `admin:read` — only the
branch-protection check needs it). Repo settings and branch protection: `scripts/repo-settings.sh`.
