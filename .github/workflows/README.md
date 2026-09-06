# `.github/workflows/` — CI / CD

Ported from `ofri-peretz/eslint`. Every workflow is checked by `npm run lint:workflows`
(top-level `permissions`, per-job `timeout-minutes`, `concurrency` on PR triggers,
Node from `.nvmrc`, npm cache).

## Gates (required checks on `main`)

| Workflow | Check name | When |
| :-- | :-- | :-- |
| [`quality.yml`](./quality.yml) | `Quality Gate` | every PR push, push to main — lint, markdown, workflow conventions, lockfile |
| [`quality-full.yml`](./quality-full.yml) | `Quality (Full) Gate` | non-draft PRs, `run-full-ci` label, push to main, weekly — test, build, typecheck |
| [`claude-code-review.yml`](./claude-code-review.yml) | `review` | non-draft PRs; green no-op until `CLAUDE_CODE_OAUTH_TOKEN` exists |

## Release loop

| Workflow | Role |
| :-- | :-- |
| [`changesets-pr.yml`](./changesets-pr.yml) | PR: changeset advisory. Main: opens the "Version Packages" PR with auto-merge |
| [`release.yml`](./release.yml) | Push to main: detect version diff vs npm → build → publish with provenance, tag, GitHub Release |

## Security

| Workflow | Role |
| :-- | :-- |
| [`codeql.yml`](./codeql.yml) | CodeQL on the promote gate and weekly |

Secrets: `NPM_TOKEN` (until Trusted Publishing is configured per package),
`CLAUDE_CODE_OAUTH_TOKEN` (optional), `RELEASE_BOT_PAT` (optional, lets the Version PR
self-approve). Repo settings and branch protection: `scripts/repo-settings.sh`.
