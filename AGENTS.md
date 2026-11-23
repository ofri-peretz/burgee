# AGENTS.md

The entry point for a coding agent working in this repository. It says what the repo is and
where things live; [`CLAUDE.md`](./CLAUDE.md) holds the working rules and gotchas, and wins
where the two differ.

## What this is

**burgee** is a CLI framework that replaces commander and yargs, is drop-in compatible with
both, and projects help, `--json`, `--schema`, an MCP server and completions from one
declaration. The repository is a turbo monorepo of ten public, independently released
packages and one private grader. None of the ten depends on anything outside this
repository. The tenth is the reservation `controlroom@0.0.1`, with no API yet.

## Packages

`ls packages/`; each `package.json` `description` is the canonical one-liner, and
[`/llms.txt`](https://burgee.interlace.tools/llms.txt) renders the package map from those
manifests. `compat-oracle` is private: it grades each drop-in path with the incumbent's own test
suite. Each README is its package's canonical page: `scripts/sync-package-docs.ts` projects it
into the package's docs app, and a lock fails when they differ.

## Where the docs live

- **Sites:** one per published package, `https://<package>.interlace.tools`, each a thin
  Next.js 16 + fumadocs app under `apps/` on the shared private chassis `apps/docs-chassis`.
  [`.github/vercel-apps.json`](./.github/vercel-apps.json) names every app once — host,
  Vercel project, directory, build — and the deploy workflows read only that. Adding a
  package's site is a row there plus an app directory. Read
  [`apps/docs/AGENTS.md`](./apps/docs/AGENTS.md) before touching any of them: this Next.js is
  newer than your training data.
- **The front door:** [burgee.interlace.tools](https://burgee.interlace.tools) — `apps/docs`,
  the one app with the family-wide pages (compatibility, comparison, gallery, benchmarks);
  every other site links there for them. Its `/docs/packages/<name>` and the moved
  `/docs/coming-from/*` URLs 301 to the package hosts.
- **Content:** each app's `content/docs/`. Package README pages are generated — edit the
  package README, then run `npx tsx scripts/sync-package-docs.ts`.
- **For agents:** [`/llms.txt`](https://burgee.interlace.tools/llms.txt) (the map, with a
  package → incumbent table), [`/llms-full.txt`](https://burgee.interlace.tools/llms-full.txt)
  (the whole corpus), and a Markdown twin of every page at its URL plus `.md`.
- **Evidence and decisions:** `.sdlc/research/` (the research every claim traces to),
  `.sdlc/intents/<name>/` (intent and spec per change), `.sdlc/decisions/` (one file per
  decision; the policy is `.sdlc/DECISIONS.md`) and `.sdlc/gaps/` (one file per gap; the
  policy is `.sdlc/GAPS.md`).

## Commands

Node 24 (`engines`; the hooks break on older).

```bash
npm run ci:local          # the pre-push gate: typecheck + test + build via turbo
npm run lint              # eslint + workflows + markdown + brand + artifacts, separate from ci:local
npm test                  # vitest at the root config, then turbo run test per package
npm run bench             # the benchmark suite
npm run mutation:changed  # changed-lines mutation lane vs origin/main (pre-push runs it; needs cargo)
npm run mutation:weekly   # full mutation run that lands the ratchet PR (launchd, Saturdays)
npm run ledger -- new decision <slug>   # one file per decision or gap, never a table row
```

Everything else is a check whose failure names the fix: commit format (commitlint),
changesets, the ledger format, README weight (`weight:converge`), generated files (each
`--check` names its writer), skipped hooks and CI polling (`.claude/hooks/guard-bash.mjs`).
