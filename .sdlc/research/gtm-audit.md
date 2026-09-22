# Go-to-market audit — 2026-09-22

Releases, the blog, READMEs, messaging, self-measurement, agent resonance, SEO and AEO.
Read-only audit of `origin/main` at `bdaf364f81` and of `blog-public`. Each gap names its
fix; nothing below is done except where marked **done**.

## Top 10, ranked by impact

| #   | Gap                                                                                                               | Fix                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | Version PR #437 is `BLOCKED` with 0 checks — the fifth time (#299, #367, #383, #393). Nothing ships until it moves | Set `RELEASE_BOT_PAT`, or mint a token with `actions/create-github-app-token` in `changesets-pr.yml`                |
| 2   | Docs home (`index.mdx`) is titled "Interlace CLI" and says burgee *delegates* to commander; README says *replaces* | Rewrite `index.mdx` from the README pitch; it is also the sidebar title every page shows                            |
| 3   | No package had a docs page                                                                                        | **done** — `scripts/sync-package-docs.ts` projects each README to `/docs/packages/<name>`, locked against drift      |
| 4   | B1 — "does an agent do better with burgee?" — has never produced a number (118 `not-run` of 119 results)          | Set `CLAUDE_CODE_OAUTH_TOKEN` for `bench.yml`; B1 is the claim the whole pitch rests on                            |
| 5   | Docs app has no `sitemap.ts`, `robots.ts`, `metadataBase`, canonical, or JSON-LD                                  | Add all four in `apps/docs/src/app`; `noindex` the brand-lab / caique-lab / caique-sheet pages                       |
| 6   | Every `package.json` `homepage` points at GitHub; no README links to `burgee.interlace.tools`                    | Point `homepage` at `/docs/packages/<name>`; add a docs link under each README header                               |
| 7   | Count and status drift in the root README                                                                         | **Partly done** — counts say nine and paratext has its row and mark. Still open: the "planned · 0.0.1 stub" status on four released 0.2–0.4 packages     |
| 8   | npm keywords miss what people and models search for                                                               | burgee: `cli-framework`, `argument-parser`, `mcp-server`, `model-context-protocol`, `ai-agent`, `json-schema`, `zero-dependency`; the others: `non-tty`, `json`, `agent` |
| 9   | No root `AGENTS.md`; `llms.txt` has no package → incumbent map                                                    | Add both; the map is the single most quotable line for "commander alternative" questions                            |
| 10  | burgee is invisible on the blog — one "Coming soon" card                                                          | Open `sdlc/intent/burgee-agent-help-parsing.md` in `blog-public` (angle 1 below)                                    |

## Release queue

**Pipeline.** A changeset is required on any `packages/*` change (`changesets-pr.yml:148-218`).
On main, `changesets/action` runs `changeset:version` (version → `sync-doc-versions` →
lockfile) and turns on auto-merge. `release.yml` diffs each public package against npm,
builds once, runs `check:artifacts`, and runs `npm publish --provenance`. All 9 public packages match npm
today (burgee 0.9.0 … paratext 0.5.0).

**Gaps.**

- #1 above — the Version PR opened by `GITHUB_TOKEN` triggers no workflows, so it never goes green.
- No merge queue (`PLAN.md:224`, owner step 0.3). #437 races 8 open `chore/bench-series-*`
  PRs, and each merge regenerates it. Either enable the queue, or have the nightly append to
  one rolling PR.
- `release.yml` does not wait for Quality Gate. An admin-merged red main still publishes.
  Gate `detect` on the head commit's required checks.
- `NPM_TOKEN` is long-lived. Move to npm Trusted Publishing (OIDC) and delete the secret.
- `gh release create` is fed the whole `CHANGELOG.md` (`release.yml:197`). Slice out the `## <ver>` section.
- Stale queue files: `.claude/QUEUE-parked.md` and `.claude/TODO.md` are empty templates;
  `LANES.md:123`, `FINISH-ALL.md:228-237`, `PLAN.md:465-470` and
  `.github/workflows/README.md:19` ("advisory") describe a pipeline that no longer exists.
  Delete the stubs and strike the stale lines.
- Cadence: 13 Version PRs in 9 days, 7 on 2026-09-21. That is fine for a pre-1.0 project, but it contradicts
  PLAN's "one batch per wave". Change the rule or the behaviour.

## Blog (`blog-public`)

**How it runs.** There are six committed artifacts per article: intent, spec, plan, article, review,
incident. The 9.5 floor is enforced by `sdlc-quality-lock.test.ts` as a shrink-only ratchet. Publishing is a manual
`publish-devto.yml` dispatch with `dry_run` on by default. Slugs and ids are frozen by a hook.

**Drift.**

- `eslint-plugin-dependency-weight`, `eslint-plugin-maintenance-signals` and
  `significance-from-a-lookup-table` are live on dev.to, but their intents are not `shipped`.
  Add a lock: `devto_id` ⇒ `status: shipped`.
- `sitemap.ts:21-22` lists `/stats` and `/analytics`, which both 301 to `/scorecard`, and it omits
  `/scorecard`, `/npm` and `/foundations`.
- There is no `llms-full.txt`, even though a `.md` twin of every article already exists. `llms.txt` describes the site as ESLint-only.
- `BlogPosting` JSON-LD has no `author` `@id`, no `isPartOf` and no `BreadcrumbList`.

**burgee angles**, ranked by fit with the existing audience:

1. **T3 measured.** "I pointed an agent at N commander CLIs; X% of its failures were
   help-text parsing." The spec evidence is B1 (gap #4), so this is blocked on it. It follows on from the
   agent-schema article's audience.
2. **Dependency weight, part 2.** Nine packages with no dependency outside the repo, against the
   commander/yargs install trees. It reuses the method from `eslint-plugin-dependency-weight`.
3. **Tutorial: change one import.** A commander CLI gets `--json`, `--mcp` and completions,
   with the compat oracle's 1360/1360 as evidence. Use landscape framing per `REVIEW.md` pass 2.

## Messaging

The pitch exists and is good — *"Everything a CLI needs that isn't your CLI. Written once,
served to humans and agents alike."* It is just not the same pitch everywhere:

| Surface                  | Says                                                   |
| ------------------------ | ------------------------------------------------------ |
| Root README              | replaces commander and yargs; nine packages            |
| Root README, family      | four released packages still marked "planned" stubs    |
| Docs home                | "Interlace CLI"; delegates parsing to commander/yargs  |
| `llms.ts:34`             | "…projected from one declaration" (third variant)      |
| `the-floor.mdx` / README | 74 vs 101 floor requirements                           |
| caique README            | "Pre-release" at 0.4.0                                 |

Fix: one canonical pitch in `llms.ts`, imported by the docs layout. Let the README carry
the same string, checked by a small lock of the same kind as `sync-doc-versions`.

## Self-measurement

| Measured today                                  | Not measured                                              |
| ----------------------------------------------- | --------------------------------------------------------- |
| B2 perf, B3 compat, B4 weight — every PR        | **B1: agent task success** (never run)                    |
| Evals layer 2: can an agent write a plugin      | End-user agent tasks; eval history (`evals/results` is gitignored) |
| OpenSSF Scorecard; codecov (weekly, non-gating) | Own npm downloads and dependents over time                |
| Blog: dev.to reception bands, PostHog           | Docs traffic, `llms.txt` hits, AI-referrer share          |
|                                                 | Whether ChatGPT / Claude / Perplexity cite burgee         |

The cheapest adds: commit eval results. Add burgee's packages to the existing Supabase
`daily-impact-ingest` (it already tracks npm for the ESLint plugins). Add a weekly job that
asks three assistants five fixed questions ("commander alternative", "yargs json output",
"expose a CLI over MCP", …) and records whether burgee is named.

## Agent resonance, AEO and SEO

**Already strong.** `/llms.txt` and `/llms-full.txt` are projected from the docs and locked by a
test. `--schema` and `--mcp` are documented. The README has comparison tables and a measured
legibility table. Those are the formats models quote.

**Missing, in the order models would notice:**

1. The incumbent names in titles and H2s. Models answer "commander alternative" from pages
   that literally say it. Add `/docs/vs/commander` and `/docs/vs/yargs`, each with the compat number.
2. A short FAQ block in the burgee npm README, since the npm READMEs are the most-indexed copy.
3. A root `AGENTS.md`, plus a package map in `llms.txt` (package → what it replaces →
   docs URL).
4. `.md` twins of docs pages. The blog already serves these, so the pattern can be copied.
5. `SoftwareSourceCode` JSON-LD and a sitemap on the docs site (gap #5).
6. Package READMEs other than burgee and seniority never mention `--json`, `--schema` or MCP,
   which is the one angle that sets each of them apart.
