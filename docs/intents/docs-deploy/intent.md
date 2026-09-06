# Intent — The docs site deployed, on an interlace.tools host, readable by agents

> Stage 1 artifact. Child of [`agent-native-cli-layer`](../agent-native-cli-layer/intent.md).
> Stage 5 for `apps/docs`, which today builds green and is served nowhere.

**Status:** review · **Opened:** 2026-09-06 · **Owner:** @ofri-peretz

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
  `/docs/the-floor`, `/docs/research`, `/llms.txt` return 200.
- A merge that touches only `packages/**` does **not** trigger a docs deploy
  (turbo-affected check), pinned by a workflow-lock test on the `if:` expression.
- The manual workflow with `target=preview` produces a preview URL; with
  `target=production` and no `RELEASE_APPROVAL`, it pauses.
- `curl -s https://cli.interlace.tools/ | grep -c <meta name="x-build-sha"` matches the
  merged SHA after `auto-deploy.yml` completes.

## Open questions

None open. Decided at finalisation (2026-09-06):

- **Host is `cli.interlace.tools`**, one subdomain per property like the others.
- **One app, hard-coded** in the workflows; the `vercel-apps.json` map returns when a
  second app exists.
