# AGENTS.md

The map for a coding agent in this repository. [`CLAUDE.md`](./CLAUDE.md) holds the working
rules and wins where the two differ.

## What this is

**burgee** is a CLI framework that replaces commander and yargs, is drop-in compatible with
both, and projects help, `--json`, `--schema`, an MCP server and completions from one
declaration. It is a turbo monorepo of independently released packages under `packages/`; each
`package.json` `description` is the canonical one-liner. `compat-oracle` is private: it grades
each drop-in path with the incumbent's own test suite.

## Where the docs live

- **Sites:** one Next.js + fumadocs app per published package under `apps/`, on the shared
  chassis `apps/docs-chassis`. [`.github/vercel-apps.json`](./.github/vercel-apps.json) names
  every app once, and the deploy workflows read only that. Read
  [`apps/docs/AGENTS.md`](./apps/docs/AGENTS.md) before touching any of them: this Next.js is
  newer than your training data.
- **The front door:** `apps/docs` ([burgee.interlace.tools](https://burgee.interlace.tools))
  holds the family-wide pages (compatibility, comparison, gallery, benchmarks).
- **Package pages** are generated from each package README by
  `scripts/sync-package-docs.ts`; edit the README.
- **Evidence and decisions:** `.sdlc/research/`, `.sdlc/intents/<name>/`, `.sdlc/decisions/`
  and `.sdlc/gaps/`; create entries with `npm run ledger -- new decision <slug>`.

## Commands

Node 24. `npm run ci:local` is the pre-push gate (typecheck, test, build via turbo);
`npm run lint` is CI's separate lint job. Everything else is a check whose failure names the
fix, including the guidance lint (`npm run lint:guidance`) that holds this file's size.
