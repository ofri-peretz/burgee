# AGENTS.md

The entry point for a coding agent working in this repository. It says what the repo is and
where things live; [`CLAUDE.md`](./CLAUDE.md) holds the working rules and gotchas, and wins
where the two differ.

## What this is

**burgee** is a CLI framework that replaces commander and yargs, is drop-in compatible with
both, and projects help, `--json`, `--schema`, an MCP server and completions from one
declaration. The repository is a turbo monorepo of nine public, independently released
packages and one private grader. None of the nine depends on anything outside this
repository.

## Package map

| Package | What it owns | Replaces |
| :-- | :-- | :-- |
| [`burgee`](./packages/burgee/) | argv, dispatch, the manifest and every surface projected from it | commander · yargs |
| [`roundel`](./packages/roundel/) | colour: output policy, semantic tokens, theme | chalk · picocolors |
| [`flagstaff`](./packages/flagstaff/) | render: frame loop, spinners, progress, boxes, tables | ora · log-update · boxen · cli-table3 |
| [`caique`](./packages/caique/) | prompts that are flags first and never hang | inquirer · clack |
| [`linegauge`](./packages/linegauge/) | measuring, wrapping and slicing styled text | string-width · wrap-ansi · strip-ansi · slice-ansi |
| [`seniority`](./packages/seniority/) | config precedence with provenance | cosmiconfig · dotenv · rc |
| [`bellpull`](./packages/bellpull/) | subprocesses and executable resolution | execa · cross-spawn · which |
| [`closeout`](./packages/closeout/) | exit handlers, terminal restore, bounded shutdown | signal-exit · exit-hook · restore-cursor |
| [`paratext`](./packages/paratext/) | hyperlinks, images, title, clipboard, notifications, bell | ansi-escapes (OSC half) · terminal-link · term-img |
| [`compat-oracle`](./packages/compat-oracle/) | private: grades each drop-in path with the incumbent's own test suite | — |

Each package's `package.json` `description` is the canonical one-liner, and its README is
the canonical page: `scripts/sync-package-docs.ts` projects every README into that package's
own docs app (`apps/docs-<name>/content/docs/index.md`; burgee's into
`apps/docs/content/docs/packages/burgee.md`), and a lock test fails when any of them differ.

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
  `.sdlc/intents/<name>/` (intent and spec per change), `.sdlc/DECISIONS.md`.

## Commands

From [`CLAUDE.md`](./CLAUDE.md), with Node 24 (`nvm use 24`; the hooks break on older):

```bash
npm run ci:local   # the full pre-push gate: typecheck + test + build via turbo
npm run lint       # eslint + workflows + markdown + brand + artifacts — separate from ci:local
npm test           # vitest at the root config, then turbo run test per package
npm run bench      # the benchmark suite
```

Generated files each have a writer and a `--check` twin — run the writer, never hand-edit:
`scripts/sync-package-docs.ts`, `scripts/sync-doc-versions.ts`, `scripts/readme-benchmarks.ts`,
`npm run brand`, `npm run compat:page`.

## Rules

- Branch `<type>/<slug>`. Commit `<type>(<scope>): <subject>`; the scope, when present, must
  be a package name or one of `docs ci deps release workspace benchmarks` — commitlint
  enforces the enum.
- A change to any `packages/*` source or `package.json` needs a changeset
  (`.changeset/<slug>.md`); internal-only work takes the `skip-changeset` label instead.
- Editing a package README changes its packed size: the foundation weight band
  (`.sdlc/bands/foundation-ceilings.json`) must be re-measured, or the weight locks fail.
- `git push` runs a 3–4 minute pre-push battery. It is not a hang. **Never `--no-verify`.**
- Every number in prose comes from a file in this repository — a generated page, a baseline,
  a band — and a claim that cannot be measured is written as *unmeasured*, not estimated.
