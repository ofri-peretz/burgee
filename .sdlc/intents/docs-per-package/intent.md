# Intent — One docs app per published package, and a table that makes the fifth one a row

> Stage 1 artifact. Child of [`docs-deploy`](../docs-deploy/intent.md), which shipped the
> deploy path this one repeats (PR #85, `d478ef9b51`). Its own finalisation note is the
> seed: *"One app, hard-coded in the workflows; the `vercel-apps.json` map returns when a
> second app exists."* A second app now exists to build, so the map returns.

**Status:** draft · **Opened:** 2026-09-08 · **Owner:** @ofri-peretz

---

## What is wanted

Every **published** package in this repo has its own documentation site, on its own
`interlace.tools` subdomain, deployed by the same workflow from the same table:

| Package | Host | App |
| :-- | :-- | :-- |
| `burgee` | `burgee.interlace.tools` | `apps/docs` — live today as `cli.interlace.tools` |
| `roundel` | `roundel.interlace.tools` | new |
| `flagstaff` | `flagstaff.interlace.tools` | new |
| `caique` | `caique.interlace.tools` | new, **when it earns one** — see below |

And the thing that actually has to be true when this lands, which is not the four sites:

**Adding the fifth package must be adding a row to a table, not cloning an app.** One
file — `.github/vercel-apps.json` — names every deployable app once, and everything else
reads it: the deploy workflow's matrix, the affected computation, the post-deploy check,
the host each app puts in its own `llms.txt`, and the locks. Nothing about a package's
site may be stated in two places.

Three things follow from that and are part of what is wanted, not decoration:

1. **The family-wide pages stay on burgee.** `compatibility`, `comparison` and `gallery`
   are generated from one measurement each; they live at `burgee.interlace.tools` and the
   other three sites link to them. One scoreboard, one comparison table, one gallery, so a
   published number cannot disagree with itself across four hosts. burgee is the front
   door.
2. **Four Next apps are not four copies of the same six config files.** The shared
   chassis — `next.config.mjs`, `source.config.ts`, the layout, the brand components, the
   `llms.txt` / `llms-full.txt` routes, the two docs tests — lives in one place that each
   app imports.
3. **A package earns its app.** An app with one page is worse than a section on burgee's
   site: it costs a Vercel project, a DNS record, a GitHub Environment and a post-deploy
   check, and it returns a page that would have been a heading. The bar is written down
   and checked, not judged per package.

## Why now

- **The deferral has expired, in the words of the thing that deferred it.** `docs-deploy`
  closed with the `vercel-apps.json` map postponed "until a second app exists"; the same
  sentence is a comment in the shipped workflow, at
  `.github/workflows/deploy-docs.yml:55-58`, above `PRODUCTION_URL:
  https://cli.interlace.tools`. That constant, hard-coded on the grounds that there is one
  app, is what a second app breaks.
- **The deploy path is proven, once.** PR #85 (`d478ef9b51`) is the fix that made a
  production deploy actually serve: the Vercel CLI runs at the repo root, `--archive=tgz`
  on both deploy lines, `--target=preview` on the preview line, `302` counted as
  Deployment Protection. `scripts/deploy-lock.test.ts` records twelve mutations, each
  proven red. Copying a proven path three times is a different act from writing four
  untested pipelines, and this is the window in which the first is still possible.
- **Three of the four packages are published and none has a site.** `packages/burgee`
  0.3.0, `packages/roundel` 0.1.0, `packages/flagstaff` 0.1.0, `packages/caique` 0.1.0 —
  four `private: false` packages, one site, and that site is titled "Interlace CLI"
  (`apps/docs/content/docs/index.mdx`). `roundel` shipped `roundel/chalk` at 58/58 and
  `flagstaff` shipped `flagstaff/ora` at 99/99 and `flagstaff/log-update` at 99/99; a
  reader who arrives from chalk has nowhere to be sent that is about roundel.
- **PRINCIPLES.md rule 8 already requires this** — "Each package is an independent
  product. Its own name, README that leads with its own incumbents and never with a
  sibling, **its own docs**, benchmarks and scoreboard rows." The READMEs comply. The docs
  do not.
- **The sibling repo shows both the pattern and its failure mode.**
  `eslint/.github/vercel-apps.json` maps three apps to project ids and production URLs and
  its `deploy.yml` reads them with `jq`. Its `auto-deploy.yml` does *not*: it carries a
  hand-written job per app and a second copy of the mapping under the comment "Keep this
  table in lockstep with `.github/vercel-apps.json`." Three apps is where that is still
  survivable. This intent is the chance to take the pattern without the duplication.
- **The count is not four.** `cli-output-stack` names one package per layer and
  `.sdlc/intents/README.md` already carries thirty-plus intents; `plugin-contract`,
  `caller-matrix` and the native front-end each imply surfaces of their own. Four
  hand-written apps are four copies of one mistake, and the fifth package makes it five.

## Affected users and systems

- **New:** `.github/vercel-apps.json`; one app directory per row under `apps/`; a private
  shared workspace holding the docs chassis; new lock tests under `scripts/`.
- **Changed:** `.github/workflows/deploy-docs.yml` (gains an `app` input; `PRODUCTION_URL`
  stops being a workflow-level constant), `.github/workflows/auto-deploy.yml` (one matrix
  instead of one job), the root `vercel.json` (per-app keys move to the table),
  `scripts/deploy-lock.test.ts` (its assertions become per-row), `apps/docs` (adopts the
  shared chassis; keeps the family-wide pages; gains a per-package index).
- **Unchanged, deliberately:** `scripts/compat-page.ts` and `scripts/gallery-page.ts` keep
  writing to `apps/docs/content/docs/` and nowhere else — that is what makes the
  scoreboard single-valued, and a lock now says so.
- **Owner-only, outside an agent's reach:** four Vercel projects, four DNS records, four
  GitHub Environments with reviewers, and the rename of the live host from
  `cli.interlace.tools` to `burgee.interlace.tools`.
- **Published numbers that move:** none. No pass rate, size or benchmark changes. The
  scoreboard's *address* changes, which `.sdlc/bands/scoreboard-public.json` records.

## Constraints

1. **One copy of every family-wide number.** `compatibility`, `comparison` and `gallery`
   exist at exactly one URL. A second copy of any of them, anywhere in `apps/`, is a
   failure — not a stale page, a wrong page.
2. **Everything `docs-deploy` constrained still holds**, per package: `main` only, Vercel
   Git integration off, no per-branch previews, a manual production deploy pauses for
   `RELEASE_APPROVAL`, an automatic one does not because the merged PR was the gate, and
   every deploy verifies the host serves the `x-build-sha` it just built.
3. **No fact about an app is written twice.** Host, project id, app directory, build
   command and output directory are in the table or nowhere. A workflow that greps for an
   app name, a second mapping "kept in lockstep", or a host in a source constant that the
   table does not own, are all the same defect.
4. **The proven path is not re-derived.** `apps/docs` keeps its workspace name, its
   directory and the root-relative build that #85 established. Cosmetic renaming of the
   one app that is known to deploy is not in this intent.
5. **The shared chassis is private and internal.** It is not published, does not appear on
   npm, and does not become a dependency of anything under `packages/`. PRINCIPLES.md
   rule 2 governs published packages; this must not quietly become an exception to it.
6. **Adding a package must not require editing a workflow.** If shipping package five
   means a diff in `.github/workflows/`, this intent did not land.
7. **Budget.** Vercel stays on the plan the repo is on today; no app adds analytics, CSP
   or a runtime service. PRINCIPLES.md rule 1: packages, never services — four static
   sites are four static sites.

## Success criteria

Each line is checkable by a person or by a command.

1. `.github/vercel-apps.json` exists, and a test fails if any `private: false` package
   under `packages/` has neither a row nor an entry in the file's `excluded` map with a
   reason. Proven red by adding a fifth published package with no row.
2. A test fails if any row's app directory is missing, or if its `package.json` name
   differs from the row's `workspace`. Proven red by renaming an app directory.
3. A test fails if `compatibility.mdx`, `comparison.mdx` or `gallery.mdx` appears under
   any app that is not the row marked as the family front door, and fails if either
   generator's output path leaves that app. Proven red by copying `gallery.mdx` into a
   second app.
4. A test fails if any app's site constant is not exactly its own row's `productionUrl`.
   Proven red by pointing roundel's `llms.txt` at burgee's host — which is the copy-paste
   this whole change makes likely.
5. `.github/workflows/` contains **no app name** other than inside `vercel-apps.json`.
   Proven red by re-adding a per-app job.
6. Deploying package five requires exactly one file to change: a row in
   `.github/vercel-apps.json`, plus that package's app directory. Demonstrated by doing it
   for the second app and diffing the workflow files — the diff is empty.
7. `https://roundel.interlace.tools/` returns 200 and serves the `x-build-sha` of the
   commit that built it; `https://roundel.interlace.tools/llms.txt` returns 200, names
   `roundel.interlace.tools` in its rows, and links to burgee's host for `compatibility`
   and `gallery`.
8. Every one of `scripts/deploy-lock.test.ts`'s existing twelve mutations is still proven
   red, now for every row rather than for one file.
9. `npm run lint` and `npm test` pass; `turbo run typecheck test build` is green with the
   new apps in the graph.

Explicitly **not** a success criterion, because it is measurably false today and this
change does not fix it: *"a merge that touches only one package deploys only that
package's site."* See the open question below.

## Open questions

1. **The host rename.** The intent above says `burgee.interlace.tools`; the deployed host
   is `cli.interlace.tools` — in `.github/workflows/deploy-docs.yml:58`, in
   `apps/docs/src/lib/llms.ts` (`SITE`), and on the Vercel project named
   `cli-interlace-tools`. Does `cli.interlace.tools` 301 to the new host, stay as a family
   alias, or get retired? Owner's call; it is DNS and a Vercel project, not code.
2. **`caique`'s app.** Its intent is at `review`, `decide()` is started and `ask()` is not,
   and the compatibility rows for clack and inquirer are recorded as *blocked*. On the bar
   this design proposes it does not qualify today. Does the owner accept the bar and let
   caique's row wait, or accept a thin fourth site now?
3. **The affected gate gets worse before it gets better.** `auto-deploy.yml` records the
   measurement: the root workspace devDepends on `burgee`, `compat-oracle` and
   `flagstaff`, so a one-file commit under `packages/roundel/` marks *all eleven*
   workspaces changed. At one app that is one redundant deploy per product merge; at four
   it is four. The design proposes a mitigation for the opposite error (a `packages/caique`
   change reaching *no* app) but does not fix this one, whose only fix is the root
   `devDependencies` — which are there for their own reasons. Does the owner want that
   opened as its own intent, or accept the redundant deploys?
4. **Four GitHub Environments, or one.** Per-app environments let a reviewer see which
   site they are approving; one shared environment is one place to add reviewers. This is
   a preference, and the design picks per-app pending the owner's word.
