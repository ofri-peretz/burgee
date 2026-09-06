# Intent — An agent-native layer on top of commander and yargs

> Stage 1 artifact of the AI-native SDLC. Opened from the 2026-09-05 npm-trends read
> (commander, yargs, oclif, chalk) and a full read of the 329 open issues across the
> six leading CLI libraries — see `docs/research/competitor-open-issues.md`.

**Status:** review · **Opened:** 2026-09-05 · **Owner:** @ofri-peretz

---

## What is wanted

Interlace owns **every layer above argv parsing** for Node CLIs, built on commander
**and yargs** through parser adapters and never replacing either: schema, config
precedence, validation relationships, help rendering, structured output, error
lifecycle, prompts, completions, testing — and a **machine-readable manifest** that
turns any CLI built on the layer into a toolset an AI agent can drive in one call
instead of many. Because the layer sits above the parser, an existing CLI on either
library keeps its parser and gains the floor.

Concretely, once this lands:

1. A CLI built on the layer answers `--schema` with its full command tree, options,
   types, env bindings and examples as JSON, and `--json` on every command with one
   stable envelope. An agent learns the whole CLI in one call and never parses prose.
2. In a non-TTY or agent session the CLI never prompts, never spins, never redraws,
   never prints help on a runtime failure, and every error carries the exact flag or
   command that fixes it.
3. The same floor is enforced statically by `eslint-plugin-cli-floor`, so a CLI that does
   not use the runtime layer can still be held to it.
4. The repo itself runs on the Interlace ESLint ecosystem — every plugin that applies
   to a Node runtime — and is the reference consumer for them.

## Why now

- **The market is transitive, not chosen.** commander and yargs downloads track total
  npm install volume, and the 2025→2026 spike tracks AI coding tools shipping CLIs on
  them. A new parser has no entry point: citty with UnJS/Nuxt distribution sits at
  3 releases in 24 months; oclif, the only full framework, is the flat line at the
  bottom of the chart after eight years.
- **The incumbents are healthy and will not move up-stack.** commander: v15 on
  2026-05-29, 9 releases in 24 months, 8 open items, pushed 2026-09-01. yargs: v18.1
  on 2026-07-26, pushed 2026-09-04, 211 open items. Nothing to displace; a stable
  floor to build on.
- **Their trackers are a specification for the layer above them.** Of 329 open
  issues, the clusters by size are help rendering, config/env precedence, validation
  relationships, completions, error lifecycle, TypeScript derivation, prompts and
  machine-readability. Parsing edge cases are a minority and commander fixes them.
- **Agents are now the primary caller.** clack #533 (2026-05): interactive CLIs
  "hang forever" under AI coding agents. citty #187 wants command output "to
  feedback to LLM". yargs #1005/#2121 and citty #117 want the CLI as data. Nobody
  owns this, and it is exactly the shape of thing Interlace already does for React:
  a floor, enforced by lint, sitting on a runtime it does not replace.

## Affected users and systems

- **Repo** `ofri-peretz/cli`, sibling of `eslint/` and `interlace/`, a turborepo like
  every Interlace repo, under the same AI-native SDLC (`../AI_NATIVE_SDLC.md`). It
  replaces a stale fork of Shopify's CLI that previously held the name (wiped
  2026-09-05, zero own commits).
- **`apps/docs`**, the documentation site (Next.js + fumadocs, as in `eslint/apps/docs`),
  where the floor, the research and every rule are published.
- **`eslint/` monorepo** gains only a `cli` preset in `eslint-config-interlace`,
  depending on `eslint-plugin-cli-floor` published from this repo.
- **Interlace's own CLIs**: `interlace-ui` (interlace repo), the `scripts/*.ts` CLIs
  in the eslint repo, the agents-repo skills' shell entry points. They become the
  first consumers and the first benchmark subjects.
- **Published numbers that move**: npm download counts for the new packages, the
  Interlace plugin count, and a new control-band metric: agent tokens-per-task.

## Constraints

1. **commander and yargs are peer dependencies behind adapters, not forks.** No argv
   parsing of our own. If a parsing bug matters, it is fixed upstream. The core never
   imports a parser; an adapter does.
2. **Zero runtime dependencies** in the core package. ESM-only,
   Node 24 natives (`util.styleText`, `util.parseArgs` not needed, `fs.glob`,
   `process.stdout.isTTY`). oclif/core #1627 is the cautionary tale.
3. **A CLI using the layer must remain a plain commander or yargs program.** The
   parser instance is reachable; every parser API works. Adoption is additive.
4. **Dogfood the ecosystem.** The repo runs `eslint-config-interlace` `quality` +
   `node-security` + `secure-coding` recommended, the react plugins on the docs app, oxlint fast pass, lefthook, changesets, turbo —
   the same tooling as `eslint/` and `interlace/`.
5. **AI-native SDLC from day one.** `docs/intents/` with the lock, `evals/` layer 1,
   control bands with at least one band computing before v1.
6. **Every floor rule has a lint rule or a runtime guarantee.** A rule that has
   neither is a suggestion, and suggestions are not a floor.

## Success criteria

- `npx <any-cli-on-the-layer> --schema | jq` returns the full command tree; a lock
  test pins the JSON shape.
- An agent benchmark (`benchmarks/agent-cli-bench`) shows **≥40% fewer tokens and
  ≥30% fewer turns** to complete a fixed task set against a layered CLI versus the
  same CLI on plain commander, measured non-interactively with `claude -p`. The
  metric becomes a control band.
- `eslint-plugin-cli-floor` ships ≥10 rules, each with a positive and negative fixture,
  and flags ≥1 real finding on each of the three internal CLIs on first run.
- The repo's own lint runs ≥9 Interlace plugins with zero disabled rules in the
  runtime packages.
- Zero prompts, spinners or ANSI in captured output when `stdout` is not a TTY —
  pinned by a test that runs the CLI through a pipe.

## Open questions

- ~~**Package names.**~~ Decided 2026-09-05: public packages are **host-branded
  extensions, unscoped**, the way `eslint-plugin-*` is: `commander-agent`,
  `yargs-agent`, then `commander-schema`, `commander-env`, `commander-completions`,
  `yargs-json`, … one per layer per host, each in its host's extension idiom. The
  shared contract is the internal scoped `@interlace/cli-core` (the
  `@interlace/eslint-devkit` precedent). No `@interlace/*` on anything public. All
  names above were free on npm on 2026-09-05; `yargs-schema` and
  `commander-testing` are taken.
- ~~**Where the ESLint plugin lives.**~~ Decided 2026-09-05: here, in
  `packages/eslint-plugin-cli-floor`, on `@interlace/eslint-devkit`. Everything for the CLI
  space is under this one repo.
- ~~**Agent-detection contract.**~~ Decided 2026-09-06: `!isTTY(stdout) || CI || --json
  || --schema`. No process or `CLAUDECODE` sniffing; `--json` means no human is present.
- ~~**Schema library.**~~ Decided: Standard Schema is the only external contract; a tiny
  built-in type set (`flag`, `string`, `number`, `choice`, `file`, `path`, `object`) keeps
  the core zero-dependency. See `commander-schema`.
- ~~**Relationship to clack.**~~ Decided: wrapped, never re-exported, and only inside
  `commander-prompts` / `yargs-prompts`. See `cli-prompts`.
