# Design — `commander-env`

Intent: [`intent.md`](./intent.md). **Status:** draft.

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
