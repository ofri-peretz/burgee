# Design — One docs app per published package

Intent: [`intent.md`](./intent.md). **Status:** draft.

Parent design: [`docs-deploy/design.md`](../docs-deploy/design.md), whose R1–R6 this one
generalises from one app to N. Nothing below re-argues a decision that design made; where
a line of it changes, the change is named.

---

## Requirements

### The table

- **R1** `.github/vercel-apps.json` exists at the repo root of `.github/`, in the shape the
  sibling `eslint` repo already carries, extended with the three fields this repo needs.
  One entry per deployable app, keyed by **app key** (the value a workflow dispatch takes
  as its `app` input):

  ```json
  {
    "$schema": "https://json-schema.org/draft-07/schema",
    "$comment": "Every deployable app in this repo, once. Read by deploy-docs.yml, auto-deploy.yml and scripts/vercel-apps-lock.test.ts. orgId and projectId are PUBLIC identifiers, not secrets; VERCEL_TOKEN is the only secret. Adding a package means adding a row here and an app directory — never a workflow edit.",
    "orgId": "team_sZpUs6MAa1BKXZJY6Hq2nfnh",
    "apps": {
      "burgee": {
        "package": "burgee",
        "workspace": "docs",
        "dir": "apps/docs",
        "projectId": "prj_…",
        "productionUrl": "https://burgee.interlace.tools",
        "rootDirectory": "",
        "buildCommand": "npx turbo run build --filter=docs",
        "outputDirectory": "apps/docs/.next",
        "familyPages": true
      },
      "roundel": {
        "package": "roundel",
        "workspace": "docs-roundel",
        "dir": "apps/docs-roundel",
        "projectId": "prj_…",
        "productionUrl": "https://roundel.interlace.tools",
        "rootDirectory": "",
        "buildCommand": "npx turbo run build --filter=docs-roundel",
        "outputDirectory": "apps/docs-roundel/.next",
        "familyPages": false
      }
    },
    "excluded": {
      "caique": "Has not earned an app: `.sdlc/intents/caique/` is at `review`, `ask()` is unbuilt, and its clack/inquirer scoreboard rows are recorded blocked. Its pages live at burgee.interlace.tools/docs/caique until the bar in docs-per-package/design.md §R12 is met."
    }
  }
  ```

  Field by field, and why each is in the file rather than somewhere else:

  | Field | What it holds | Who reads it |
  | :-- | :-- | :-- |
  | *(key)* | the app key; the `app` input to `deploy-docs.yml` | both workflows, the locks |
  | `package` | the `packages/*` name this app documents | L1 (every published package has a row or an exclusion) |
  | `workspace` | the `name` in the app's `package.json` | the affected computation — this is the string turbo prints |
  | `dir` | the app directory, repo-relative | the locks, the Next cache key, the family-page lock |
  | `projectId` | Vercel project id. **Public, not a secret** — the sibling's `$comment` says so and its `deploy.yml` proves it, reading ids from the file with one repo secret in play | the deploy job |
  | `productionUrl` | the canonical host, `https://<name>.interlace.tools` | the post-deploy check, the app's own `SITE`, the locks |
  | `rootDirectory` | `""` for every row in this repo — see R6 | the self-heal PATCH |
  | `buildCommand` | `npx turbo run build --filter=<workspace>` | the self-heal PATCH |
  | `outputDirectory` | `<dir>/.next` | the self-heal PATCH |
  | `familyPages` | exactly one row is `true`: the app that owns `compatibility`, `comparison`, `gallery` | R13 and R14, and locks L6 and L7 |

- **R2** `orgId` is one value for all rows; `VERCEL_TOKEN` remains the only secret in the
  deploy path. `secrets.VERCEL_ORG_ID` and `secrets.VERCEL_PROJECT_ID`, which
  `deploy-docs.yml` reads today, are **removed** — a per-app secret scheme would be N
  secrets to add, rotate and get wrong, for values that are not secret.

### The shared chassis

- **R3** A private workspace `packages/docs-kit` (`"name": "docs-kit"`, `"private": true`,
  `"version": "0.0.0"`) holds everything four Next apps would otherwise copy. It is
  skipped by `scripts/package-shape-lock.test.ts`, which selects `packages/*` with
  `pkg.private !== true`, so PRINCIPLES.md rule 2 is unaffected — but L14 pins that
  reasoning so nobody later flips `private` and quietly makes a docs framework a published
  product.

- **R4** `docs-kit` exports, and an app's own files are only what genuinely differs:

  | Export | Replaces, per app |
  | :-- | :-- |
  | `docs-kit/next-config` | `next.config.mjs` — `createMDX()` + `reactStrictMode` |
  | `docs-kit/source-config` | `source.config.ts` — `defineDocs({ dir: 'content/docs', … })` |
  | `docs-kit/source` | `src/lib/source.ts` — `loader({ baseUrl: '/docs' })`, `getPageOrNotFound` |
  | `docs-kit/llms` | `src/lib/llms.ts` — `llmsIndex`, `llmsFull`, taking `site` as an **argument** instead of the module constant `SITE` that is hard-coded to `https://cli.interlace.tools` today |
  | `docs-kit/routes` | the `llms.txt` / `llms-full.txt` / `api/search` handlers and their `force-static` directives |
  | `docs-kit/layout` | `src/lib/layout-shared.tsx`, `src/app/layout.tsx`'s `x-build-sha` metadata, `mdx-components.tsx` |
  | `docs-kit/brand` | `brand-logo.tsx`, `brand-mark.tsx`, `burgee-mark.tsx`, `burgee-flag.tsx`, `opengraph-image.tsx`, `global.css` — parameterised by the row's colours |
  | `docs-kit/testing` | `llmsProjectionSuite({ appDir, site })` and `buildShaSuite({ appDir })`, so `tests/*.test.ts` in each app is three lines rather than the 80 that exist today |
  | `docs-kit/config` | `readVercelApps()` / `appConfig(key)` — the typed reader for `.github/vercel-apps.json`, used by the locks and by each app's `src/site.ts` |

- **R5** Each app keeps exactly six things of its own: `package.json`, `tsconfig.json`,
  `postcss.config.mjs`, `src/site.ts` (three lines — its app key, re-exported config),
  `content/docs/**`, and thin re-export files at each Next-required path
  (`src/app/layout.tsx`, `src/app/llms.txt/route.ts`, …). Next requires files at fixed
  paths; a re-export line is the smallest thing that can live there.

  **The trade, stated:** `docs-kit` is one more workspace to build, version-in-lockstep and
  keep green, and a change to it rebuilds and redeploys every app. That is the cost of not
  having the same bug in four places. It is a private workspace and not a published
  package precisely so it never acquires the obligations of one — no README leading with
  its incumbents, no compatibility row, no size ratchet.

### Vercel, and the failure this repo is one row away from

- **R6** Every row carries `rootDirectory: ""`. PR #85 established why for this repo:
  Root Directory unset means the Vercel CLI runs at the repo root, which is the only
  directory that sees both the app and the hoisted `node_modules` an npm-workspaces
  install produces. Rooted at the app, the prebuilt upload died on `File does not exist:
  "node_modules/client-only/index.js"`.

- **R7** …and that creates the problem this requirement exists to close. With
  `rootDirectory` unset, **every Vercel project reads the same root `vercel.json`** — which
  today says `"buildCommand": "npx turbo run build --filter=docs"` and `"outputDirectory":
  "apps/docs/.next"`. Four projects, one config: all four hosts would serve burgee's site.
  This is not hypothetical. It is the incident the sibling repo already had and wrote into
  its workflow: its `registry` project drifted to `rootDirectory=.` with `buildCommand=…
  --filter=docs`, and shipped docs content to the registry domain.

  The fix, which is also the sibling's mechanism used one notch further:

  1. The root `vercel.json` keeps only what is **true for every app** — `$schema`,
     `framework`, `installCommand`, `git.deploymentEnabled: false`. `buildCommand` and
     `outputDirectory` are removed from it.
  2. `deploy-docs.yml` gains a `Self-heal Vercel project config` step, ported from
     `eslint/.github/workflows/deploy.yml`, PATCHing the row's values onto the project
     before `vercel pull`:

     ```bash
     curl -sf -X PATCH \
       "https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}?teamId=${VERCEL_ORG_ID}" \
       -H "Authorization: Bearer ${VERCEL_TOKEN}" -H "Content-Type: application/json" \
       -d "$(jq -nc --arg root "$ROOT_DIRECTORY" --arg build "$BUILD_COMMAND" --arg out "$OUTPUT_DIRECTORY" \
         '{rootDirectory: $root, buildCommand: $build, outputDirectory: $out, installCommand: null, framework: null}')"
     ```

     The sibling nulls `buildCommand`/`outputDirectory` so the app-local `vercel.json`
     wins; here there is no app-local `vercel.json` to win, so the table supplies them.
     Either way the dashboard is derived from a reviewed file and cannot drift, which is
     the property that matters.
  3. `vercel pull` then writes those settings into `.vercel/project.json`, and
     `vercel build` honours them.

### Deploy: one workflow, N apps

- **R8** `deploy-docs.yml` gains an `app` input (`type: string`, default `burgee` — not a
  `choice`, because a fixed options list is a second copy of the table). `preflight` gains
  a `Resolve the app` step that `jq`-reads the row and fails loudly on an unknown key, in
  the shape the sibling uses:

  ```bash
  ROW=$(jq -e --arg app "$APP" '.apps[$app]' .github/vercel-apps.json) || {
    echo "::error::No app '$APP' in .github/vercel-apps.json. Known: $(jq -r '.apps|keys|join(", ")' .github/vercel-apps.json)"
    exit 1
  }
  ```

  It emits `project_id`, `production_url`, `root_directory`, `build_command`,
  `output_directory` and `dir` as job outputs. The workflow-level `env: PRODUCTION_URL:
  https://cli.interlace.tools` is **deleted**; the deploy job reads
  `needs.preflight.outputs.production_url`. `concurrency.group` becomes
  `deploy-docs-${{ inputs.app }}-${{ inputs.environment }}-${{ inputs.ref || github.ref }}`
  so two apps deploy in parallel and the same app never overlaps itself.

- **R9** `auto-deploy.yml` becomes one matrix. Its `affected` job intersects turbo's output
  with the table's `workspace` values and emits a JSON array of app keys:

  ```bash
  AFFECTED=$(npx --no turbo run build --filter="...[$BEFORE_SHA]" --dry-run=json | jq -r '.tasks[]?.package' | sort -u)
  APPS=$(jq -c --argjson ws "$(printf '%s' "$AFFECTED" | jq -R . | jq -sc .)" \
    '[.apps | to_entries[] | select(.value.workspace as $w | $ws | index($w)) | .key]' .github/vercel-apps.json)
  echo "apps=$APPS" >> "$GITHUB_OUTPUT"
  ```

  and the dispatch job becomes:

  ```yaml
  deploy:
    needs: affected
    if: needs.affected.outputs.apps != '[]'
    strategy:
      fail-fast: false
      matrix:
        app: ${{ fromJSON(needs.affected.outputs.apps) }}
  ```

  with the existing `gh workflow run deploy-docs.yml … -f app=${{ matrix.app }} -f
  environment=production -f ref=${{ github.sha }} -f approval=RELEASE_APPROVAL`. The
  no-diff-base branch keeps its "deploy to be safe" behaviour, emitting every key.

  This is deliberately **not** what the sibling does. `eslint/.github/workflows/auto-deploy.yml`
  carries three hand-written jobs and a `case "$ws" in …` mapping under the comment "Keep
  this table in lockstep with `.github/vercel-apps.json`". Two copies of a mapping is the
  thing this intent exists to prevent; R17 makes it a test.

- **R10** The GitHub Environment becomes per app: `${{ inputs.app }}-${{ inputs.environment
  == 'production' && 'production' || 'preview' }}` — `burgee-production`,
  `roundel-preview`, and so on. Auto-created on first use; required reviewers are an owner
  action per environment. Everything else `docs-deploy` established is unchanged and stays
  under `scripts/deploy-lock.test.ts`: `workflow_dispatch` only, `main` only, the
  `RELEASE_APPROVAL` refusal, `--archive=tgz` on both deploy lines, `--target=preview` on
  the preview line, no `working-directory`, the `x-build-sha` read-back, the `/llms.txt`
  row count, `302/307/401/403` treated as Deployment Protection, `000` treated as DNS.

  **Turbo-affected, honestly.** `docs-deploy`'s intent records this criterion as **not
  met** and this design does not claim otherwise. The root workspace devDepends on
  `burgee`, `compat-oracle` and `flagstaff`, so turbo reports all workspaces changed for
  most `packages/**` commits. At N apps that means N production deploys per product merge
  instead of one redundant deploy. The one place it fails in the *other* direction is
  sharper and is fixed here: a `packages/caique/**` commit reaches only the `caique`
  workspace, so an app that did not depend on it would never redeploy and would go stale
  silently. **R10a**: each app declares a workspace `devDependency` on the package it
  documents, which puts it in turbo's dependent set and lets the app import the package to
  render live examples. Neither of these is a fix for the root-devDependency over-firing,
  which is out of scope and named as an open question in the intent.

### What each app contains, and when a package earns one

- **R11** Content, day one, stated without flattery.

  | App | Pages | Honest assessment |
  | :-- | :-- | :-- |
  | `burgee` (`apps/docs`) | all nine it has today, plus a family index linking the three sibling hosts | Unchanged and complete. It keeps `compatibility`, `comparison`, `gallery`, `research`, `the-floor`, `your-own-burgee` — the family-wide pages — and is the front door. |
  | `roundel` (`apps/docs-roundel`) | `index`, `getting-started`, `policy`, `tokens-and-theme`, `chalk-migration` — five | Genuine. `roundel` is published at 0.1.0 with four subpaths and `roundel/chalk` graded 58/58; a reader arriving from chalk has somewhere to land. Links out to burgee for its compatibility row and its B4 weight rows. |
  | `flagstaff` (`apps/docs-flagstaff`) | `index`, `getting-started`, `the-plugin-contract`, `flagstaff-check`, `ora-migration` — five | Genuine. Loop, plugin host, five built-ins, `flagstaff/ora` 99/99 and `flagstaff/log-update` 99/99. The **gallery stays on burgee**: it is generated from `registered()` across the family, and a second copy would be a second answer. |
  | `caique` | — | **Thin, and therefore not built.** `decide()` is started, `ask()` is not, and the clack and inquirer rows are recorded blocked. Day one it is an index page and a promise. It stays at `burgee.interlace.tools/docs/caique` and gets an `excluded` entry with that reason. |

- **R12** **The bar.** A package earns its own app when all four hold, and the exclusion
  entry names which one it fails:

  1. it is `private: false` under `packages/` and published at `>= 0.1.0`;
  2. it has **at least four** package-specific pages that are not family-wide — i.e. that
     would be wrong to move to burgee's site;
  3. it has at least one row of its own on the compatibility scoreboard, or a recorded
     decision that it will never have one;
  4. its intent is at `approved` or `shipped`.

  Below the bar, the package's pages live under burgee's `content/docs/<package>/`, and
  the day it clears the bar those files move to the new app and burgee keeps a redirect.
  A one-page site costs a Vercel project, a DNS record, an Environment and a post-deploy
  check to serve a heading; the bar is what stops that being a judgement call each time.

### Family-wide pages

- **R13** `scripts/compat-page.ts` and `scripts/gallery-page.ts` keep their `OUT`
  constants — `apps/docs/content/docs/compatibility.mdx` and `.../gallery.mdx`. They are
  not parameterised, not templated, and not run per app. The single change is that both
  now derive `apps/docs` from the `familyPages: true` row via `docs-kit/config`, so the
  path and the table cannot disagree.

- **R14** Every non-family app's `content/docs/index.mdx` links to
  `<familyUrl>/docs/compatibility`, `/docs/comparison` and `/docs/gallery` by absolute
  URL, resolved from the table at build time — never by a relative link, which would 404,
  and never by a copied number.

## Design

### Files, and the order

The order is chosen so that each step is green on its own and the risk-bearing step is
second-to-last.

| # | Step | Files |
| :-- | :-- | :-- |
| 1 | The table, and the lock that reads it — with **no** app added yet, so `burgee` is the only row and everything is provably still green | `.github/vercel-apps.json`, `scripts/vercel-apps-lock.test.ts` |
| 2 | Extract the chassis from `apps/docs` into `docs-kit`; `apps/docs` becomes its first consumer. The site must be byte-identical after this step | `packages/docs-kit/**`, `apps/docs/**` (thinned), `package-lock.json` |
| 3 | Rewire the workflows onto the table, still one row | `.github/workflows/deploy-docs.yml`, `.github/workflows/auto-deploy.yml`, `vercel.json`, `.github/actions/setup/action.yml`, `scripts/deploy-lock.test.ts` |
| 4 | The owner creates the `roundel` Vercel project and DNS record; the row is added | `.github/vercel-apps.json` |
| 5 | `apps/docs-roundel` — five pages and six files. **This is the step that proves the intent:** if it needs a workflow edit, the design failed | `apps/docs-roundel/**`, `.changeset/config.json`, root `package.json` (no change — `apps/*` is already a workspace) |
| 6 | `apps/docs-flagstaff`, by copying step 5 | `apps/docs-flagstaff/**`, `.changeset/config.json` |
| 7 | The host rename, if the owner takes option (a) in the intent's open question 1 | the `burgee` row; DNS; a Vercel redirect |

Two details that are easy to miss and each cost a red CI run:

- **`.changeset/config.json`** carries `"ignore": ["docs"]`. Every new app workspace goes
  in that list, or `changeset version` tries to version a private docs site.
- **`.github/actions/setup/action.yml`** hard-codes the Next cache to `apps/docs/.next/cache`
  with a key hashing `apps/docs/**`. It becomes `apps/*/.next/cache` keyed on `apps/**`,
  which trades a little cache precision for not needing an edit per app — an edit per app
  is exactly what R17 forbids.

### `src/site.ts`, the one file that makes R4's parameterisation real

```ts
// apps/docs-roundel/src/site.ts
import { appConfig } from 'docs-kit/config';
export const site = appConfig('roundel');
```

`appConfig` reads `.github/vercel-apps.json` at build time and returns the row. Everything
downstream — `llmsIndex(pages, site.productionUrl)`, the OG card's title, the family links
in R14, the `x-build-sha` metadata — takes it from there. The constant `export const SITE =
'https://cli.interlace.tools'` in `apps/docs/src/lib/llms.ts` disappears, and so do the two
string literals of the same host in `apps/docs/tests/llms-txt.test.ts:63,75`. The host is
currently written in four places with nothing binding them; after this it is written once.

## Verification

The one command: **`npm run lint && npm test`**, which runs `eslint . --max-warnings 0`,
`npm run lint:workflows`, `npm run lint:md`, `npm run brand:check`, then
`vitest run --config vitest.root.config.ts` (the `scripts/**/*.test.ts` locks) and
`turbo run test`. `lefthook.yml`'s `pre-push` runs `turbo run typecheck test build`, and
`turbo.json` has `test` `dependsOn: ["build", "^build"]`, so each app's `.next` exists
before its own tests read it.

### New: `scripts/vercel-apps-lock.test.ts`

Written in the style of `scripts/deploy-lock.test.ts` — the claims that are about
*behaviour* execute the real `run:` block under `bash` rather than grepping the YAML for a
string, because a comment satisfies a grep.

| # | The lock | The mutation that proves it red |
| :-- | :-- | :-- |
| **L1** | Every `packages/*` with `private !== true` is a row's `package` **or** a key in `excluded` with a non-empty reason | Add a fifth published package; add neither |
| **L2** | Every row's `dir` exists, and `<dir>/package.json`'s `name` equals the row's `workspace` | Rename `apps/docs-roundel` and leave the row |
| **L3** | Every row's `dir` contains `content/docs/index.mdx` and at least four `.mdx` files (R12 bar, clause 2) | Add a row for a one-page app |
| **L4** | `productionUrl` values are distinct, all `https://<key>.interlace.tools`; `projectId` values are distinct | Paste roundel's row and change only the key — the copy-paste this change makes likely |
| **L5** | Each app's resolved site equals its own row's `productionUrl` | Point `apps/docs-roundel/src/site.ts` at `appConfig('burgee')` |
| **L6** | Exactly one row has `familyPages: true`; `compat-page.ts`'s and `gallery-page.ts`'s `OUT` both resolve under that row's `dir` | Set `familyPages: true` on a second row |
| **L7** | No app other than the family row contains `compatibility.mdx`, `comparison.mdx` or `gallery.mdx` under `content/docs/` | `cp apps/docs/content/docs/gallery.mdx apps/docs-roundel/content/docs/` |
| **L8** | The root `vercel.json` declares no per-app key (`buildCommand`, `outputDirectory`, `rootDirectory`), and every row declares `buildCommand` and `outputDirectory` | Restore `"buildCommand": "npx turbo run build --filter=docs"` to `vercel.json` — the state that would serve burgee's site on all four hosts |
| **L9** | No file under `.github/workflows/` contains any app key, `dir` or `productionUrl` from the table | Re-add a `deploy-roundel:` job, or a `case "$ws" in` mapping — the sibling's duplication |
| **L10** | *Executed:* `preflight`'s resolve step exits non-zero on an unknown `app` and zero for every key in the table | Replace the `jq -e` with `jq` and lose the `-e` |
| **L11** | `auto-deploy.yml`'s deploy job is a matrix over `fromJSON(needs.affected.outputs.apps)` and its `if:` is `needs.affected.outputs.apps != '[]'` | `if: always()` |
| **L12** | *Executed:* the affected step, fed a stub `turbo` printing a fixed workspace set, emits exactly the app keys whose `workspace` is in it — including the empty case | Make the intersection a substring match, so `docs` matches `docs-roundel` |
| **L13** | Every row's `workspace` appears in `.changeset/config.json`'s `ignore` | Add a row, forget the changeset ignore |
| **L14** | `packages/docs-kit/package.json` has `"private": true` | Flip it, and a docs framework becomes a published product against PRINCIPLES.md rule 8 |

`scripts/deploy-lock.test.ts` keeps all twelve of its recorded mutations. Three of its
assertions move rather than disappear, and the design says so plainly:

- `points Vercel at the app the root build actually emits` asserted `vercel.json`'s
  `outputDirectory === 'apps/docs/.next'` and `buildCommand` containing `--filter=docs`.
  Those two facts move to the `burgee` row and are asserted there, by L8. The root
  `vercel.json` is asserted to carry **neither**.
- The verify step read `PRODUCTION_URL` from the workflow-level `env:`, which the test
  passes in as `workflowEnv`. It now reads a preflight output; the test supplies it the
  same way and gains a case per row.
- `gates every later job on the preflight verdict` is unchanged.

### The check that would have caught the original problem

There was no original bug here — this is a change made before the failure, which is the
cheap moment. The nearest thing to a scar is the sibling's, and **L8 is the check that
would have caught it**: `eslint`'s `registry` project drifted to `rootDirectory: "."` with
`buildCommand: … --filter=docs` and served the docs site on the registry domain. This repo
would reach that state not by drift but by construction the moment a second project reads
the root `vercel.json`. L8 fails on exactly that file content.

Two gaps found while writing this, recorded rather than fixed here:

- `apps/docs/content/docs/compatibility.mdx` has **no staleness lock**. `gallery.mdx` has
  one (`scripts/gallery-page.test.ts` re-renders and compares). Neither generator runs in
  any workflow. Multiplying sites does not make that worse, so it is not in scope — but a
  scoreboard that four sites now link to is a better reason to close it than one site was.
- `apps/docs/src/app/` has no `robots` or `sitemap` route, on a site whose stated audience
  includes crawlers and agents. Four hosts is four times no robots file.

## Rejected alternatives

- **Four hand-written apps, no table.** The honest version of "we only have four". It is
  what the sibling repo did at three, and its `auto-deploy.yml` now carries a mapping that
  a comment asks a human to keep in lockstep with a JSON file. Rejected because the intent
  is not four sites; it is that the fifth is a row.

- **Per-app secrets, `VERCEL_PROJECT_ID_ROUNDEL` and so on.** The current workflow reads
  `secrets.VERCEL_PROJECT_ID`, so extending it that way is the smallest diff. Rejected:
  project and org ids are public identifiers — the sibling's `$comment` states it and its
  `deploy.yml` operates on it — so this would be N secrets protecting nothing, invisible
  to review, and settable only by the owner.

- **`rootDirectory: apps/<app>` per project, the sibling's shape.** It would let each app
  own a local `vercel.json` and need no PATCH of build settings. Rejected on a measurement
  in *this* repo: PR #85 established that an app-rooted prebuilt upload cannot see the
  hoisted root `node_modules`, and production died on `File does not exist:
  "node_modules/client-only/index.js"`. The sibling's hoisting differs; its shape is not
  evidence for this repo.

- **Swapping a per-app `vercel.json` into the repo root during the job** (`cp
  .github/vercel/<app>.json vercel.json`). Keeps every setting in a reviewed file and needs
  no API call. Rejected as slightly worse than R7: it dirties the tree mid-job, leaves the
  committed root `vercel.json` a decoy that differs from what three of four deploys use —
  the exact "two of them is worse than the wrong one" that `deploy-lock.test.ts` already
  argues about `apps/docs/vercel.json` — and it does not heal a dashboard someone edited
  by hand, which the PATCH does.

- **One app, one site, sections per package** (`cli.interlace.tools/docs/roundel/…`). The
  cheapest option by a wide margin: no new projects, no DNS, no Environments, one deploy
  per merge. Rejected against PRINCIPLES.md rule 8 — a package whose docs are a
  subdirectory of a sibling's site is not an independent product, and the rule's whole
  point is that a prefix says accessory. Kept, though, as the *sub*-bar answer: R12 sends
  packages that have not earned an app exactly here, which is why `caique` costs nothing.

- **A published `@interlace/docs-preset` package.** Would let the sibling repos share the
  chassis too. Rejected for now: a published package acquires a README leading with its own
  incumbents, a compatibility story, a size ratchet and a release cadence, for an artifact
  whose only two consumers are in one repo. Revisit when a second repo wants it.

- **Renaming `apps/docs` to `apps/docs-burgee` for symmetry.** Rejected under intent
  constraint 4: it moves the one path known to deploy, and the table's `dir` and
  `workspace` fields absorb the asymmetry at zero cost.

- **Path filters instead of turbo-affected.** Rejected in `docs-deploy` and still rejected:
  a path filter under-fires silently the day an app gains a workspace dependency, and
  R10a deliberately gives every app one.

## The cost, plainly

What this buys is one thing: each published package is a product with its own address,
its own `llms.txt`, its own OG card and its own search index, which is PRINCIPLES.md rule
8 made true rather than asserted. A reader arriving from chalk lands on roundel, not on
section four of a site named after a sibling.

What it costs, per app, once `roundel` and `flagstaff` are live (N = 3):

| Cost | N = 1 today | N = 3 | Who pays it |
| :-- | :-- | :-- | :-- |
| Vercel projects | 1 | 3 | owner, once each |
| DNS records under `interlace.tools` | 1 | 3 | owner, once each |
| Repo secrets | 3 (`TOKEN`, `ORG_ID`, `PROJECT_ID`) | **1** (`VERCEL_TOKEN`) | *this design reduces it* |
| GitHub Environments + reviewers | 2 | 6 | owner, once each |
| Post-deploy checks per merge | 1 | 3 | CI minutes |
| Production deploys per `packages/**` merge | 1 | **3** | CI minutes — and all three fire whether or not that package's docs changed, because the affected gate is unmet |
| Next builds in the pre-push battery | 1 | 3 | every push, locally |
| Config files that can disagree | 4 host literals | **1 table** | *this design reduces it* |

**What it would take to reverse.** Cheaper than it looks, and worth knowing before the
gate: delete the rows, delete the app directories, move each app's `content/docs/**` under
`apps/docs/content/docs/<package>/`, delete the DNS records and the Vercel projects. The
content is MDX and moves unchanged; the apps are six files each because of `docs-kit`; the
workflows do not change at all, since they were already reading a table that would then
have one row. The genuinely irreversible parts are external: a published subdomain that
other people have linked, and a package README pointing at it. That argues for doing
`roundel` first and living with two sites for a while before `flagstaff` and `caique`
follow — which is the order in the design above.

## Out of scope

- **Building any of it.** This is a Stage 1 + Stage 2 pair. Per `AI_NATIVE_SDLC.md` and
  the repo's working-agreement rule 3, the owner accepts at Design→Build and nothing here
  is implemented before that.
- **Fixing the turbo-affected over-firing.** Its cause is the root `devDependencies` on
  `burgee`, `compat-oracle` and `flagstaff`, which are there for their own reasons. Naming
  it is in scope; changing it is its own intent.
- **The `cli.interlace.tools` → `burgee.interlace.tools` rename**, beyond making the host a
  table field so that the rename is a one-line diff. Whether the old host redirects,
  aliases or retires is the intent's open question 1.
- **`caique`'s app.** Excluded by R12 with a written reason, revisited when it clears the
  bar.
- **A staleness lock for `compatibility.mdx`, and `robots`/`sitemap` routes.** Both are
  real gaps found while writing this; neither is caused or worsened by this change.
- **Analytics, CSP, PostHog** — still deferred, now four times over.
- **Sharing the chassis with the `eslint` or `interlace` repos.** One repo first.
