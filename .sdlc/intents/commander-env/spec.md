# Design — `commander-env`

Intent: [`intent.md`](./intent.md). **Status:** review.

---

## Requirements

- **R1 (V1)** `withEnv(program, { prefix?: string, config?: ConfigSpec })` installs a
  `preAction` hook that, for the running command's option set, resolves each value by
  precedence flag > env > config > package.json field > default, and writes the result
  into commander's option values before the action runs.
- **R2 (V2)** Env names come from `Option#env()` (commander) or `commander-schema`
  `env:`; with `prefix`, undeclared options get `PREFIX_OPTION_NAME` automatically,
  SCREAMING_SNAKE from the camelCase key, never camel-cased back (yargs #2005).
- **R3 (V3)** `--explain <option>` (hidden global option) prints the winning source and
  all candidates; `meta.provenance: Record<key, { source, location? }>` under `--json`.
- **R4 (V4)** `name`/`version`/`description` resolve from the `package.json` nearest to
  the **entry file** (`import.meta.url` walk), not `process.cwd()`.
- **R5 (V6)** Config discovery in the fixed order; `--no-config` disables all discovery;
  `--config <path>` is explicit; missing explicit file is a `CONFIG` exit; missing
  discovered file is silent.
- **R6 (V7)** `extends: string | string[]` resolved relative to the extending file and
  via `node_modules` (like `eslint`'s), deep-merged left to right, cycles rejected.
- **R7** Booleans from env accept `1/0/true/false/yes/no`; `--no-x` semantics from
  `PREFIX_NO_X` are **not** supported (one spelling: `PREFIX_X=false`), answering yargs
  #2501 by decision rather than by a second grammar.

## Design

```
packages/cli-core/src/precedence/
  resolve.ts     resolve(optionSpecs, { flags, env, config, pkg, defaults }) → { values, provenance }
  config.ts      discover(order) → loaders (json, yaml via yaml@?, js/ts via import())
packages/commander-env/src/
  index.ts       withEnv(program, opts) — preAction hook, --explain, --config, --no-config
  package-json.ts  owning package.json resolution (V4)
```

`resolve` is pure: it takes the parsed flags (commander's `optsWithGlobals()` plus
`getOptionValueSource()` to know which were set by the user), the env slice, the merged
config object and the defaults, and returns values plus provenance. Its purity is what
makes `--explain` trustworthy and the yargs side trivial.

YAML support is a peer dependency (`yaml`), loaded lazily only if a `.yaml` config is
discovered, keeping the core zero-dep.

## Status (2026-09-08)

| Req | State | Where |
| :-- | :-- | :-- |
| R1 (V1) | `resolve(specs, layers)` in core, pure: flag > env > config > package.json field > default; env only for the running command's declared options | `packages/burgee/src/precedence.ts`, `precedence.test.ts` |
| R2 (V2) | `envPrefix` on `defineProgram`; `PREFIX_OPTION_NAME` in SCREAMING_SNAKE from the camelCase key, never camel-cased back; an option's own `env:` wins | "names come from the prefix" |
| R3 (V3) | `--explain <option>` (reserved) prints the winner and every candidate it beat; `meta.provenance` under `--json` on every run; the commander front-end fills it from commander's own value sources | `env.test.ts`, `commander-command.ts` |
| R4 (V4) | `--version` (reserved): the declared version, else the `package.json` nearest the entry file (`RunOptions.entry`, `process.argv[1]` by default) | `pkg.ts`, "--version reads the package.json that owns the entry file" |
| R5 (V6) | `config: true \| { name }` opts in; `--config <path>` > `NAME_CONFIG` > `./name.config.{json,mjs,js,cjs}` > `package.json#name` > `$XDG_CONFIG_HOME/name/config.json`; `--no-config` disables all of it; explicit missing → CONFIG (3), discovered missing → silent; loaded lazily (K6) | `config.ts`, `config.test.ts` |
| R6 (V7) | `extends: string \| string[]`, relative to the extending file or through node_modules, deep-merged left to right, cycles rejected, the chain shown by `--explain` | "extends (V7)" |
| R7 | env booleans accept `1/0/true/false/yes/no`; anything else is CONFIG (3) with the fix; `PREFIX_NO_X` is rejected naming `PREFIX_X=false` (yargs #2501) | "booleans from env" |
| YAML | not supported — a parser is a dependency (K1); JSON and JavaScript configs cover the cases | — |
| async loaders | JavaScript configs may export a function, awaited (yargs #2234) | "loads a JavaScript config" |
| commander front-end config/`--explain` | not yet — provenance only; `withEnv` for commander syntax is the next slice | — |

## Verification

- Pure `resolve` unit suite: one test per precedence pair, one per issue number.
- Conformance on the demo: `--explain`, `--json` provenance, monorepo `--version`.
- A lock that `PREFIX_NO_X` is rejected with a `fix` naming `PREFIX_X=false`.

## Rejected alternatives

- **Configurable precedence.** Every configuration is a new bug report (yargs
  `parserConfiguration` has 30 flags and its own issue cluster).
- **cosmiconfig / lilconfig.** Adds dependencies and a discovery order we would then
  have to document anyway; the fixed order is ~40 lines.
- **Supporting `PREFIX_NO_X`.** Two spellings of one fact is the source of yargs #2501.

## Out of scope

- Secrets handling or keychain lookups.
- Writing config files (`mytool config set`) — a command, not a layer.
