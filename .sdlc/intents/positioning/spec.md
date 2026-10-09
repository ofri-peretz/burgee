# Design — Positioning: capabilities first, proof second, adoption third

Intent: [`intent.md`](./intent.md). **Status:** approved.

**Accepted by the owner, 2026-10-09, at the Design→Build gate**, as the plan in this file:
the audit first, then the root README and the docs landing, the agent page, the ten package
READMEs, and the comparison pages, one PR each.

> The owner's brief numbered these requirements `P1`–`P6`. They are `R1`–`R6` here because
> `P1`–`P3` are already floor ids in the umbrella design (interactive prompts), and
> `scripts/run-evals.ts` reads a `P` id in a child intent as a citation of that floor. The
> mapping is one to one: `P1` is R1, and so on through `P6`, which is R6.

---

## Requirements

- **R1** **No incumbent in an opening paragraph.** The first paragraph after the hero names no
  incumbent. This holds for the root `README.md`, every published package's `README.md`, and
  `apps/docs/content/docs/index.mdx`. The hero is the lockup, the tagline and the chrome under
  it (badges, the docs line, nav rows), or a page's front matter. The incumbents are derived,
  never listed: every key of `GRADED` in `packages/burgee/src/compat.ts`, every package in
  `DROP_INS`, and the scope of a scoped one. `which` and `rc` count only as code, because they
  are words first.
- **R2** **A capability-led hero and docs landing.** The root README's opening paragraphs and
  the docs landing's opening say four things, in this order:
  1. One declaration, six surfaces: help, `--json`, `--schema`, `--mcp`, completions, types.
  2. Contracts an agent can rely on: an exit code that says "rewrite the command", a `fix:`
     line it can run, `--explain` for where a value came from.
  3. One supply chain: ten packages, no dependency outside the family.
  4. Proof: each incumbent's own test suite, run against the drop-in.

  "Replaces commander and yargs" and "drop-in" move to a **Switch in one command** section that
  opens with `npx burgee migrate`.
- **R3** **The "what an agent sees" page.** It lives at
  `apps/docs/content/docs/what-an-agent-sees.mdx` and is in the navigation. It quotes recorded B1
  sessions from runs on `main` (the `b1-transcripts` artifact):
  - commander's stack trace against burgee's error and usage on `recover-failure`, with the
    turns each took;
  - a `fix:` line;
  - one `diagnose-provenance` session that used `--explain`.

  Every number on it is in a landed `benchmarks/results/agent-cli-bench/*-ci.json`, cited by run.
  It says where the pooled agent-cost claim is not met and why (D-20261008-b1-tool-name,
  D-20261009-b1-two-turns).
- **R4** **Package README openings.** Each of the ten opens with what the package does that its
  incumbent does not. Next comes a one-line adoption note naming the incumbent and
  `npx burgee migrate`, inside the 25 lines `readme-opening-lock` reads.
- **R5** **`vs/` becomes "Switching from X".** Each page is titled "Switching from X". The
  section is titled "Switching" and sits after the capability pages in the navigation. URLs and
  slugs do not change, and every table stays, including the rows burgee loses.
- **R6** **Adoption stays one command.** `npx burgee migrate` is named in the root README's
  switch section, the docs landing, and every package README's adoption note. `burgee migrate`
  itself does not change.

## Status

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | Not built | `scripts/positioning-audit.ts` derives the incumbents and finds the first paragraph | `scripts/positioning-lock.test.ts` |
| R2 | Not built | `README.md`, `apps/docs/content/docs/index.mdx` | the lock, and the before/after leads in `positioning-audit.md` |
| R3 | Not built | `apps/docs/content/docs/what-an-agent-sees.mdx`, `meta.json` | a lock that every run cited on the page has a landed result carrying the cited figure |
| R4 | Not built | `packages/*/README.md` | the lock, extended to every package README, and `readme-opening-lock.test.ts` |
| R5 | Not built | `apps/docs/content/docs/vs/*.mdx`, `vs/meta.json`, `meta.json` | `scripts/vercel-apps-lock.test.ts`: every link lands |
| R6 | Not built | every page above | the lock asserts `npx burgee migrate` in the root README and the docs landing |

## Design

**One reader of "the opening".** `scripts/positioning-audit.ts` exports `incumbents()`,
`firstParagraph()` and `named()`, and both the audit and the lock import them. The lock cannot
disagree with the audit about what counts as an opening or an incumbent.

**The incumbents come from the migration's own table.** `GRADED` and `DROP_INS` are what
`burgee migrate` acts on and what `compat-baseline-lock` and `migrate-drop-ins-lock` hold to the
oracle. A drop-in added to the family is an incumbent here the day it is graded, with no second
list to forget.

**The hero is found, not counted.** The tagline is the first centred `<p>` that is prose. After
it, anything with fewer than four words outside links, images and tags is chrome: badges, the
`Docs:` and `Migrating from:` line, the nav row. The first block after that which is neither
chrome nor structure (a heading, rule, fence, table or quote) is the opening paragraph. The
generated `Migrating from:` header line names incumbents on purpose, and it is chrome.

**The two README locks agree.** `readme-opening-lock` wants an incumbent within 25 lines of the
header, so a reader searching "chalk alternative" finds the page. This one wants none in the
first paragraph, so the page says what it is first. Both hold when the opening paragraph is short
and the adoption note follows it.

**Order of work.**
1. Audit and this design.
2. Root README and docs landing, with the lock over those two pages.
3. The agent page.
4. The ten package READMEs, with the lock extended to them (patch changesets, weight
   re-convergence, regenerated package docs).
5. The comparison pages.

The lock lands in step 2 over the pages that step fixes, and widens in step 4. A lock that
landed red over pages a later PR fixes would block every PR in between.

**The agent page cites runs, never "the newest run".** B1 lands a result on every push to
`main`, so a sentence about the newest run is false within the hour. The page names each run it
quotes by commit, and a lock checks each cited figure against that run's committed file.

## Verification

- `npx vitest run --config vitest.root.config.ts scripts/positioning-lock.test.ts`. It is proven
  red on `fc0f897104`, where the root README and the docs landing both open with "replaces
  commander and yargs". The lock also carries in-memory mutations: an incumbent written into an
  opening is caught, the English word "which" is not, `` `which` `` is, and badges and the docs
  line are skipped.
- `npx tsx scripts/positioning-audit.ts`: the after reading, recorded beside the before one.
- The existing locks stay green: `pitch-lock`, `readme-opening-lock`, `readme-lock`,
  `package-readme-header-lock`, `claim-table-lock` and `vercel-apps-lock`.

## Rejected alternatives

- **Drop the incumbents from the READMEs.** That would hide the proof. The grade against each
  incumbent's own suite is the strongest evidence the family has, and a reader leaving chalk
  needs to find the page. The incumbent moves after the capability; it does not leave.
- **A word budget per page (mentions per 100 words).** Comparison pages and migration sections
  name the incumbent because that is their subject. A budget would push the counts down by
  rewording proof. Density is reported, not gated.
- **Rename `vs/` to `switching-from/` with redirects.** Every README, package site and llms
  file links `/docs/vs/<x>`, and `vercel-apps-lock` checks links against content files, not
  redirects. Keeping the slugs and changing the titles gets the reader-facing change with no
  broken link and no redirect to maintain.
- **A generated "newest run" section on the agent page.** B1 lands a result on every push, so
  a generated section would make the page drift on every commit, or make the landing job edit
  docs. Cited runs plus a lock do not drift.

## Out of scope

- The home page `<title>`, which names commander and yargs for search (an open question in the
  intent).
- The benchmark claims and their verdicts. The README's claim table is `claim-table-lock`'s.
- `burgee migrate`'s behaviour, and the compatibility grades.
