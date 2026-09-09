# Intent — The docs site deployed, on an interlace.tools host, readable by agents

> Stage 1 artifact. Child of [`agent-native-cli-layer`](../agent-native-cli-layer/intent.md).
> Stage 5 for `apps/docs`, which today builds green and is served nowhere.

**Status:** review · **Opened:** 2026-09-06 · **Built:** 2026-09-08 · **Owner:** @ofri-peretz

> Everything that does not need a credential is built and merged; see
> [What is built](#what-is-built-2026-09-08). The status stays `review` on purpose:
> `shipped` would claim the site is live, and it is not until the three owner steps below
> are done. (`design.md` is not the reason — it has been beside this file since
> [`b68ae937c6`](https://github.com/ofri-peretz/burgee/commit/b68ae937c6), which is why it
> is not in the build-stage diff.)

---

## What is wanted

`apps/docs` deployed to Vercel from `main` only, on a host under `interlace.tools`
(proposal: `cli.interlace.tools`), with the same deploy discipline as the eslint docs
site: no preview per branch, a manual `deploy-docs.yml` for ad-hoc and emergency
deploys, production fired by `auto-deploy.yml` on merge when the app is turbo-affected,
and a post-deploy check that the production URL returns the new build. Plus `llms.txt`
and `llms-full.txt` routes, since the audience this site is written for includes the
agents the layer is for.

## Why now

- **Everything the repo publishes points at GitHub blobs.** The umbrella intent, the
  README and the PR bodies link to `github.com/.../design.md`; the floor page and the
  research page exist only in a build artifact.
- **The eslint repo already solved this**, including the failure modes: PR #123
  (`feat/auto-deploy-on-main`) and `CLAUDE.md`'s "Deploy: main branch only" section
  record why per-branch previews were turned off. Copy it, do not rediscover it.
- **Intents 2, 4 and 5 all promise "the docs site renders…"**; a site has to be live for
  those criteria to be checkable.

## Affected users and systems

- Vercel project for `apps/docs` (`vercel.json` with `git.deploymentEnabled: false`,
  as in `eslint/`), `VERCEL_TOKEN` secret, org/project ids.
- `.github/workflows/deploy-docs.yml`, `auto-deploy.yml`; `.github/vercel-apps.json`
  if the eslint pattern is kept.
- DNS for `cli.interlace.tools` (owner: @ofri-peretz).
- `apps/docs/src/app/llms.txt/route.ts`, `llms-full.txt/route.ts`, `robots`, `sitemap`.

## Constraints

1. **Only `main` deploys.** No `push:`/`pull_request:` triggers on deploy workflows; the
   Vercel Git integration stays disabled (`eslint/CLAUDE.md`).
2. Production deploy pauses for a human when fired manually (`.claude/hooks/release-
   gate.sh` pattern) but not when fired by `auto-deploy.yml` on a merged PR — that PR
   was the human gate.
3. Build stays under two minutes; the Next cache from `.github/actions/setup` is used.
4. No analytics or CSP until a later intent; keep the first deploy small.

## Success criteria

- `https://cli.interlace.tools/` serves the home page with the Interlace mark;
  `/docs/the-floor`, `/.sdlc/research`, `/llms.txt` return 200.
- A merge that touches only `packages/**` does **not** trigger a docs deploy
  (turbo-affected check), pinned by a workflow-lock test on the `if:` expression.
- The manual workflow with `target=preview` produces a preview URL; with
  `target=production` and no `RELEASE_APPROVAL`, it pauses.
- `curl -s https://cli.interlace.tools/ | grep -c <meta name="x-build-sha"` matches the
  merged SHA after `auto-deploy.yml` completes.

## What is built (2026-09-08)

The build stage landed everything that does not require a credential. Each row is either
**live** — running in CI today — or **inert**: merged, green, and doing nothing until the
owner supplies what only they can.

| Piece | Where | State |
| :-- | :-- | :-- |
| Git integration off, so no per-branch preview can ever exist | `vercel.json`, repo root (`git.deploymentEnabled: false`) | live — locked by a test |
| Manual deploy, `workflow_dispatch` only, `preview` / `production` | `.github/workflows/deploy-docs.yml` | inert — no-ops with a summary that says what happens when `VERCEL_TOKEN` appears |
| Production deploy on merge to `main`, only when turbo says `docs` is affected | `.github/workflows/auto-deploy.yml` | live as a decision; the deploy it dispatches is inert |
| Production gate: a hand-fired production deploy is refused without `approval=RELEASE_APPROVAL`; `auto-deploy.yml` supplies it, because the merged PR was the human | `deploy-docs.yml` preflight | inert (same reason) |
| Post-deploy check: the deployed URL must echo back `<meta name="x-build-sha">` for the commit that was built, and `/llms.txt` must return 200 with rows | `deploy-docs.yml` | inert |
| `x-build-sha` stamped into every page | `apps/docs/src/app/layout.tsx` | live — in the build output today |
| `/llms.txt` and `/llms-full.txt`, both generated from `source.getPages()` — the same loader `/docs/[[...slug]]` renders from | `apps/docs/src/app/llms.txt/`, `llms-full.txt/`, `src/lib/llms.ts` | live — prerendered by `next build` |
| The docs are the map: a page under `content/docs/` that never reaches `llms.txt` fails the build | `apps/docs/tests/llms-txt.test.ts` | live |
| The deploy discipline itself: manual-only triggers, the turbo-affected `if:`, the approval, `deploymentEnabled: false` | `scripts/deploy-lock.test.ts` | live |

Two things were deliberately **not** built:

- **`.github/vercel-apps.json`.** This intent decided at finalisation that there is one
  app and it is hard-coded; the map returns when a second app exists. The production host
  therefore lives as `PRODUCTION_URL` at the top of `deploy-docs.yml`.
- **A changeset.** `apps/docs/package.json` is `"private": true`, so nothing publishable
  changed and the release flow has nothing to record.

## What still needs the owner

None of it is code. Until all three exist, the workflows above stay green and inert.

1. **A Vercel project** for this repo with **Root Directory unset** — the repo root, which
   is where `vercel.json` lives — and the Git integration left off. It must be the root:
   this is an npm-workspaces monorepo, so an `apps/docs` root cannot see the hoisted
   `node_modules` the build traced. Done: `cli-interlace-tools`.
2. **Three Actions secrets** — `VERCEL_TOKEN` (a token from
   <https://vercel.com/account/tokens>), plus `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` from
   the project's Settings → General.
3. **DNS for `cli.interlace.tools`**, pointed at that project.

Optional, and only if a refusal should become a real pause: add required reviewers to the
`docs-production` GitHub Environment, which `deploy-docs.yml` already declares.

Also worth knowing: if Vercel **Deployment Protection** is left on, the post-deploy check
cannot read the page and will emit a warning rather than a pass. Turn it off for this
project, or give CI a protection-bypass secret.

## Which success criteria are checkable today

| Criterion | Today |
| :-- | :-- |
| `/`, `/docs/the-floor`, `/llms.txt` return 200 on the host | not yet — needs the project and DNS |
| A merge touching only `packages/**` does not deploy the docs | **not met** — see [Criterion 2](#criterion-2-turbo-affected-is-not-precise-here) below. What is met and locked is the weaker `if:`: the dispatch is unreachable unless the `affected` job says so, and unreachable from any ref but `main`. |
| Manual `preview` produces a URL; `production` without approval stops | logic **met** and locked; observable once the token exists |
| The production URL echoes the merged SHA back | check **written** and executed by `scripts/deploy-lock.test.ts` against a stubbed `curl` — a stale alias, a missing tag and a 5xx each fail it; the real host runs it on the first deploy |

### Criterion 2: turbo-affected is not precise here

Recorded as unmet rather than met, because it was measured and it is not.

`apps/docs` has **no** workspace dependency — nothing in `packages/**` reaches it through
the dependency graph. But the **root** workspace devDepends on `burgee`, `compat-oracle`
and `flagstaff` (and `roundel` through those two), so a change to any of them puts the root
package in turbo's changed set, and turbo then reports all 11 workspaces changed, `docs`
included. One-file commits against `turbo@11.16.0`:

| change | `--filter=...[<sha>]` reports |
| :-- | :-- |
| `packages/caique/**` — reachable from no root devDependency | `caique` only |
| `packages/burgee/**`, `packages/roundel/**`, `packages/compat-oracle/**` | all 11, `docs` included |
| `packages/flagstaff/README.md` | all 11, `docs` included |
| `apps/docs/content/docs/index.mdx` | `docs` |
| `scripts/lint-workflows.ts`, root `README.md` | nothing |

`--filter=docs[<sha>]`, `--filter=...docs[<sha>]` and `--affected` were each measured and
report the same, so this is not a filter that can be written more tightly. The only fix is
to the root devDependencies, and those exist so that the root can run the workspace CLIs —
restructuring them to buy a deploy filter would be paying the wrong price.

**What the workflow does guarantee**, and what `scripts/deploy-lock.test.ts` locks: no ref
other than `main` can deploy, the dispatch job is unreachable unless the `affected` job
computed `docs=true` from turbo's own graph, and a change outside the workspace graph
entirely (`scripts/`, root docs) deploys nothing. The practical cost of the imprecision is
a redundant deploy of an unchanged site on most product merges — wasted minutes, not a
wrong page. Tightening it is its own intent, not a thing to do quietly here.


## Open questions

None open. Decided at finalisation (2026-09-06):

- **Host is `cli.interlace.tools`**, one subdomain per property like the others.
- **One app, hard-coded** in the workflows; the `vercel-apps.json` map returns when a
  second app exists.
