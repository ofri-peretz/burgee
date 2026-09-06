# Design — Docs deploy

Intent: [`intent.md`](./intent.md). **Status:** draft.

---

## Requirements

- **R1** `apps/docs/vercel.json`: `{ "git": { "deploymentEnabled": false } }`; framework
  detection left to Vercel; `outputDirectory` default.
- **R2** `.github/workflows/deploy-docs.yml` (`workflow_dispatch`, inputs `target:
  preview|production`): setup action → `vercel pull` → `vercel build` → `vercel deploy
  --prebuilt`, production behind a GitHub Environment `docs-production` with a required
  reviewer.
- **R3** `.github/workflows/auto-deploy.yml` (`push: main`): computes
  `npx turbo run build --filter=docs...[HEAD^1] --dry-run=json` affected set; if `docs`
  is affected, calls the production deploy path; else no-op with a summary line.
- **R4** Post-deploy verification: fetch the production URL, assert 200 and that the
  page carries `<meta name="x-build-sha" content="<sha>">` rendered from
  `VERCEL_GIT_COMMIT_SHA`.
- **R5** `llms.txt` (index of pages with one-line descriptions) and `llms-full.txt`
  (concatenated processed Markdown), same routes as `eslint/apps/docs/src/app/llms*`.
- **R6** `scripts/__tests__/deploy-workflows.lock.test.ts`: deploy workflows have no
  `push`/`pull_request` triggers other than `auto-deploy.yml` on `main`; the affected
  check exists.

## Design

Copy `eslint/.github/workflows/{deploy-docs,auto-deploy}.yml`, replace the multi-app
map with one app, keep the `vercel-apps.json` shape in a comment for when a second app
appears. Secrets: `VERCEL_TOKEN`; `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` from
`.vercel/project.json` committed after `vercel link` (as eslint does).

`llms.txt` is generated at request time from the fumadocs `source` (titles +
descriptions); `llms-full.txt` uses `getLLMText` with `includeProcessedMarkdown`
enabled in `source.config.ts`.

## Verification

- Lock test R6 in `npm test`.
- First manual `target=preview` run linked in the PR; first `auto-deploy` run after
  merge linked in the follow-up comment with the `x-build-sha` check output.

## Rejected alternatives

- **Vercel Git integration with previews.** Turned off in eslint for noise, minutes,
  ambiguity and races with manual production deploys; the reasons still hold.
- **Deploying from `release.yml`.** Docs and packages release on different triggers;
  coupling them means a docs typo waits for a package version.
- **GitHub Pages.** No Node runtime for `/api/search` and the OG image route.

## Out of scope

- Analytics, CSP headers, PostHog — the eslint docs app carries them; add by intent
  when there is traffic to look at.
- A second app in this repo (Storybook, playground).
