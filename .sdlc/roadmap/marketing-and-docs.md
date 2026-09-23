# Marketing and docs roadmap

> Opened 2026-09-22. Source of evidence: [`gtm-audit.md`](../research/gtm-audit.md). The
> per-package sites are [`docs-per-package`](../intents/docs-per-package/intent.md); this
> file orders the work around them. Every numeric claim in marketing copy must already be
> on the README's "Measured" table. If a number isn't there, it isn't claimed.

## The bet, in one line

burgee is found by the thing a reader is leaving (commander, yargs, chalk, ora, inquirer,
cosmiconfig, execa), and chosen for the thing no incumbent has (one declaration served to
agents as `--json`, `--schema` and MCP). So every page, post and README opens with the
incumbent's name and closes on the agent surface.

## What we measure

A phase is done when its exit criterion is met, not when its tasks are ticked.

| Signal | Source | Baseline 2026-09-22 | Where it is read |
| :-- | :-- | :-- | :-- |
| npm weekly downloads, all nine | impact-ingest ([#14](https://github.com/ofri-peretz/impact-ingest/pull/14)) | burgee only, 39 days of history | `/scorecard` on the blog |
| GitHub stars, burgee | impact-ingest (#14) | not tracked | same |
| Dependents (npm `dependencies`) | `scripts/rank-dependents.ts` | 0 known | monthly, into this file |
| AI citation rate | the weekly probe (M4 below) | not measured | this file |
| Agent task success, B1 | `bench.yml` | never run | README "Measured" |
| Docs traffic and `llms.txt` hits | Vercel Web Analytics (page views); request logs and Observability (`llms.txt`, `.md` twins) | not measured | the Vercel dashboard |

## Phase 0: ship what is built (this week)

| # | Item | PR | State |
| :-- | :-- | :-- | :-- |
| 0.1 | The release queue unblocks itself; publishing waits for the gate | [#450](https://github.com/ofri-peretz/burgee/pull/450) | green, merging |
| 0.2 | Package pages, every package has a mark, the mark floor | [#448](https://github.com/ofri-peretz/burgee/pull/448) | rebased onto main |
| 0.3 | Docs SEO/AEO: sitemap, canonical, JSON-LD, llms package map, `.md` twins, vs-pages, FAQ, `AGENTS.md`, homepages and keywords | lane B | in progress |
| 0.4 | Release: the Version PR publishes the READMEs, homepages and keywords to npm | #437 → next Version PR | after 0.1 |
| 0.5 | Blog: sitemap, `llms-full.txt`, JSON-LD, intent-status lock, three burgee intents | lane D (blog-public) | in progress |
| 0.6 | Track all nine packages and the repo's stars | impact-ingest [#14](https://github.com/ofri-peretz/impact-ingest/pull/14), agents [#164](https://github.com/ofri-peretz/agents/pull/164) | green |

**Exit:** npm shows the nine READMEs with lockups and docs links. `burgee.interlace.tools`
serves `/sitemap.xml`, `/llms.txt` with a package map, and `/docs/packages/*`. The scorecard
shows nine download series.

## Phase 1: be findable

| # | Item | Owner | Done when |
| :-- | :-- | :-- | :-- |
| 1.1 | Submit the sitemap to Google Search Console and Bing Webmaster Tools; verify the domain | **you** (needs account access) | both show the sitemap as read |
| 1.2 | One "coming from X" page per incumbent: chalk, ora, inquirer, cosmiconfig, execa, signal-exit, string-width, ansi-escapes, the same shape as `/docs/vs/commander` | agent | **done** — [#465](https://github.com/ofri-peretz/burgee/pull/465): eight pages under `/docs/coming-from/`; execa and signal-exit say there is no graded row |
| 1.3 | Each package README opens with the incumbent it replaces, then its agent surface in 3 lines (`--json` / non-TTY behaviour) | agent | **done** — [#465](https://github.com/ofri-peretz/burgee/pull/465): `scripts/readme-opening-lock.test.ts` checks both in the 25 lines after the header |
| 1.4 | Blog `llms.txt` and `also-building.tsx` link to the docs site | lane D | merged |
| 1.5 | One canonical pitch string, exported from `apps/docs/src/lib/llms.ts`; README and layout checked against it | agent | **done** — [#465](https://github.com/ofri-peretz/burgee/pull/465): `scripts/pitch-lock.test.ts` fails on a fourth variant |

**Exit:** a search for "commander alternative" and "chalk alternative" returns a burgee page
in the top 20 on at least one engine. This is checked by hand at the end of the phase and
recorded here.

## Phase 2: measure before claiming

| # | Item | Owner | Done when |
| :-- | :-- | :-- | :-- |
| 2.1 | Run B1 (agent tokens and turns) | **you**: set `CLAUDE_CODE_OAUTH_TOKEN` for `bench.yml` | the README's `agent-tokens-40pct` row has a number, met or not |
| 2.2 | Commit eval results (`evals/results` is gitignored) so they have a history | agent | a weekly run appends one JSON. **Built in [#464](https://github.com/ofri-peretz/burgee/pull/464)**: `evals.yml` records every run on `main` to `evals/history/<date>-<sha7>.json` and lands it by PR. Layer 2 records `skipped` until `CLAUDE_CODE_OAUTH_TOKEN` is set (as for 2.1), and the PR auto-merges only with the release App or PAT (C5) |
| 2.3 | Vercel Analytics on the docs app, with a `llms.txt` / `.md` twin hit counter | agent, plus **you** to enable it on the project | a week of data. **Code in [#464](https://github.com/ofri-peretz/burgee/pull/464)**: `<Analytics />` in the root layout. The `llms.txt` / `.md` routes are `force-static` and invisible to `track()`, so their hits are read from Vercel request logs and Observability. **You**: project `burgee` → Analytics → Enable (the script 404s until then) |
| 2.4 | AI citation probe: 5 fixed questions × 3 assistants, weekly, logging whether burgee is named and which URL is cited | agent, plus **you** for API keys | 4 weeks of data in this file |

The five probe questions are fixed so the series stays comparable:

1. What is a good alternative to commander.js?
2. How do I make my Node CLI output JSON for AI agents?
3. How do I expose a command-line tool over MCP?
4. What is a zero-dependency replacement for yargs?
5. How do I stop an interactive CLI prompt from hanging in CI?

**Exit:** B1 has a number, and the probe has four weeks of history.

## Phase 3: content

Every article goes through the blog's six stages and its 9.5 floor. The order is set by
which evidence exists today.

| # | Article | Tier | Evidence | Blocked on |
| :-- | :-- | :-- | :-- | :-- |
| 3.1 | Change one import: a commander CLI gets `--json`, `--schema`, `--mcp` and completions | Tutorial | compat 1360 / 1360 (README) | nothing |
| 3.2 | The zero-dependency CLI stack, measured the way `eslint-plugin-dependency-weight` measured plugins | Measured | README "Measured" stack table | nothing |
| 3.3 | Where agents fail on CLIs: help-text parsing against a declared schema | T3 | B1 | 2.1 |
| 3.4 | Why our first bundle claim failed, and what "at parity" means (the three ❌ rows) | Essay | README "The three that are not met" | nothing |

Article 3.4 is on the list on purpose: publishing the gates that are not met is the
strongest trust signal the project has, and no competitor can write it.

**Launch kit:** [`launch-kit.md`](./launch-kit.md) has the Show HN, r/node, X and LinkedIn
drafts. It goes out after Phase 0 exits and 3.1 is published, so the launch links to a
tutorial rather than a README. **You post them**; nothing in this repo posts on your behalf.

**Exit:** 3.1, 3.2 and 3.4 published at 9.5 or higher, and the launch posted.

## Phase 4: a site per incumbent family

Execute [`docs-per-package`](../intents/docs-per-package/intent.md) as written:
`.github/vercel-apps.json` as the single table, five hosts, and one shared chassis. It
starts only after Phase 2's analytics show which `/docs/packages/*` pages are visited. The
intent's own rule applies: a package earns its app, and traffic is the evidence.

**Exit:** a new app is one row in `vercel-apps.json`, and the locks prove it.

## Phase 5: adoption

| # | Item | Owner |
| :-- | :-- | :-- |
| 5.1 | [`first-adopter`](../intents/first-adopter/spec.md): one real CLI migrated, with its maintainer's consent | **you** approve each outreach |
| 5.2 | Rank commander and yargs dependents (`npm run rank:dependents`); open issues offering a migration PR on the top 10 by fit, never unsolicited PRs | agent drafts, **you** send |
| 5.3 | A "used by" row in the README, once there is a dependent to list | agent |

**Exit:** one external dependent on npm.

## Needs you (cannot be done by an agent)

- Release token: GitHub App (`RELEASE_APP_ID` / `RELEASE_APP_PRIVATE_KEY`) or `RELEASE_BOT_PAT`. See `GAPS.md` C5.
- Merge-queue ruleset on `main` (C6), and npm Trusted Publishing for the nine packages (C7).
- Search Console and Bing verification (1.1); Vercel Analytics (2.3); API keys for B1 and the probe (2.1, 2.4).
- Approving the three burgee intents in `blog-public` (3.1–3.3) and posting the launch.
