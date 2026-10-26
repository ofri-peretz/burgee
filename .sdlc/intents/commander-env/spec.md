# Design — `commander-env`

Intent: [`intent.md`](./intent.md). **Status:** approved (2026-10-25).

---

## Design gate 2026-10-25

**Accepted for Build, narrowed**
([D-20261025-commander-env-design-accepted](../../decisions/D-20261025-commander-env-design-accepted.md)).
The `withEnv` design below was superseded by `seniority` and the native engine
(§ Restated 2026-10-18). This gate rules on the five open items.

**In scope.**

1. V2, env names in `--schema`. A test asserts that an option declared with `env` publishes that
   name on the option in `--schema` and on its `inputSchema` property under `--mcp`. Proven red
   by dropping `env` from the projection in `schema.ts` in a scratch edit.
2. K3, the discovery order in `--explain`. `config explain` prints, under the precedence
   order, the discovery order from `seniority`'s `candidates()`: each path, the reason it was
   tried, and which one won. `--explain <option>` names the winning file and the position it
   won from. `--json` carries the same list. Proven red by a test that expects the
   order and runs against today's output.

**Settled at this gate, nothing to build.**

- C3b is measured and held as a reading. Over 71 CI readings dated 2026-10-08 to 2026-10-18, the
  `diagnose-provenance` task's median turns are 5 for burgee and 11 for commander. The
  per-reading ratio has median 0.500 (range 0.385–1.222), below 1 in 68 of 71. The source is the
  `diagnose-provenance.turns` detail of each `agent` record in
  `benchmarks/results/agent-cli-bench/*-ci.json`. It is reported and not gated.
- C1 (the plain-commander differential and the uncited issues) is dropped. R3's façade half
  (`--explain` on `burgee/commander` and `burgee/yargs`) is dropped. The reasons are in the
  decision.

## Status 2026-10-25

Built in batch 29. Both rows this gate kept are held on merged code. The intent stays `approved`
only because both are runtime changes in `burgee`. They reach users with the `burgee` minor in
`.changeset/burgee-env-in-schema-discovery-order.md`, and once it publishes nothing is left.

| row | state | where | check | proven red by |
| :-- | :-- | :-- | :-- | :-- |
| V2 — env names in `--schema` and `--mcp` | built | `packages/burgee/src/schema.ts`: `env` joins the keys an option's property carries as declared | `packages/burgee/src/schema-env.test.ts` › "is on the option and on its inputSchema property in --schema, and absent where none was declared", › "is on the tool’s inputSchema property under --mcp" | both, run against `main`: `--schema` carried `env` on the option, and neither `inputSchema` property carried it |
| K3 — the discovery order in `config explain` | built | `config-layers.ts` `discoveryOf()` over seniority's `candidates()`; `config-explain.ts` lists it under the option rows, and `--json` carries `data.discovery` | `packages/burgee/src/config-explain.test.ts` › "config explain prints every path tried, in order, with why, and marks the one read", › "carries the same order under --json, and the path read", › "says discovery is off under --no-config, and that --config names the one file read", › "reads nothing, and marks nothing read, where no candidate exists" | the first three, run against `main`: no discovery section existed |
| K3 — the discovery order in `--explain` | built | `as-typed.ts` adds one line under the explanation when a config file won; `config-layers.ts` walks the order only when `--explain` was asked | `packages/burgee/src/config-explain.test.ts` › `"--explain <option> names the file a config value won from, and its place in the discovery order"`, › "--explain counts the place of a file read further down the order, from the user config directory", › "--explain says nothing about discovery when the value did not come from a config file" | the first, run against `main` |

**Stryker over the changed lines.** The first run of `scripts/mutation.ts changed` left 7
survivors. Five were killed by tests: the `--no-config` JSON shape, a directory with no
candidate, and the required `io`. Two were marked equivalent, each with its reason on the line. One
is the condition that walks the order only under `--explain`: walking it on every run changes no
output, only cost. The other is `execute.ts`'s existing condition for loading `as-typed.js`,
which this change touched only to pass `io`.

**Out of scope, noticed.** An option that reads its variable through `envPrefix` (`APP_REGION`
from `envPrefix: 'APP'`) still publishes no `env`, because the prefixed name is derived at
resolution and not stored on the option. V2 as designed covers a declared `env`.

## Restated 2026-10-18

**R1, R2, R4, R5 and R7 are held on main through `seniority` and the native engine. R6's `--explain` chain and `node_modules` case move to `seniority` R7. R3's façade half is unbuilt — REMAINING: R3 (`--explain` and a checked `meta.provenance` on the façades).**

Verified against burgee `main` at `1013b65db5` with `git grep`; no test was run. The § Design
tree below (`packages/cli-core/src/precedence/`, `packages/commander-env/src/`, `withEnv`)
was never built. The resolver is `packages/seniority/src/precedence.ts`, `explain.ts` and
`config.ts`. The native engine (`packages/burgee/src/execute.ts`, `config-layers.ts`,
`pkg.ts`) calls it on every run. The commander-syntax `withEnv` is not built; on
`burgee/commander` a program keeps commander's own `Option#env()`, graded by the compat
oracle. The intent-level criteria (C1–C4, V2, K3) are in
[`intent.md` § Restated 2026-10-18](./intent.md#restated-2026-10-18).

| ID | promised | on main | check | disposition |
| :-- | :-- | :-- | :-- | :-- |
| R1 | `withEnv` `preAction` hook resolving flag > env > config > package.json > default, for the running command only | yes, as the engine's resolution step, not a hook | `packages/seniority/src/precedence.test.ts` › "flag > env > config > package.json > default (V1)" (five cases); `packages/burgee/src/env.test.ts` › "env beats config, a flag beats env"; › "env never leaks into a command that does not declare the option (V1, yargs #873)" | restated |
| R2 | env names from the option's `env`, or `PREFIX_OPTION_NAME` in SCREAMING_SNAKE, never camel-cased back | yes (`envPrefix` on `defineProgram`, `OptionSpec.env`) | `packages/seniority/src/precedence.test.ts` › "names come from the prefix in SCREAMING_SNAKE, never camel-cased back (yargs #2005)"; › "an explicit env name wins over the prefix (yargs #1655), and without a prefix there is none" | held |
| R3 | `--explain <option>` prints the winner and all candidates; `meta.provenance` under `--json` | native engine: yes. `burgee/yargs`: provenance yes, `--explain` no. `burgee/commander`: `_provenance()` exists but no test asserts a non-empty record; `--explain` no | `packages/burgee/src/env.test.ts` › "--explain \<option> prints the winner and the candidates it beat, and runs nothing"; `packages/seniority/src/explain.test.ts` › "names the winner and every candidate, in ORDER, whether it was set or not"; `packages/burgee/src/yargs/burgee.test.ts` › "wraps the handler return value with provenance" | native held; façade half remaining |
| R4 | `name`/`version` from the `package.json` nearest the entry file, not `process.cwd()` | yes | `packages/burgee/src/env.test.ts` › "--version reads the package.json that owns the entry file (V4), unless the program declares one"; `packages/burgee/src/owning-package.test.ts` › "finds the CLI's own package.json, not the installing project's" | held |
| R5 | fixed discovery; `--no-config` disables all; explicit missing is `CONFIG`, discovered missing is silent | yes | `packages/seniority/src/config.test.ts` › "lists explicit env, the cwd files by extension, then the user directory"; › "--config names a file explicitly; a missing one is a CONFIG error, not silence (yargs #1676)"; › "--no-config disables discovery entirely, explicit env included"; `packages/burgee/src/env.test.ts` › "--no-config drops the file and the package.json field; --config names one; a missing one exits CONFIG (3)" | held |
| R6 | `extends` relative or through `node_modules`, deep-merged left to right, cycles rejected | relative, left-to-right, deep merge and cycles: yes. A `node_modules` target is tested only in the negative ("names an unresolvable extends target"). The chain is recorded (`loaded.chain`) but not shown by `--explain`, whatever the 2026-09-08 status row says | `packages/seniority/src/config.test.ts` › "deep-merges nested keys, the extending file winning (yargs #1305, #1627)"; › "resolves relative to the extending file, left to right, and records the chain"; › "rejects a cycle by name (yargs #1363)" | held; chain-in-`--explain` and the positive `node_modules` case moved → `seniority` R7 |
| R7 | env booleans `1/0/true/false/yes/no`; `PREFIX_NO_X` rejected naming `PREFIX_X=false` | yes | `packages/seniority/src/precedence.test.ts` › "booleans from env: one spelling each way (R7)" (six `%s → %s` cases); › "anything else is a CONFIG error naming the fix"; › "PREFIX_NO_X is rejected with the one spelling named (yargs #2501)"; `packages/burgee/src/env.test.ts` › "a bad env boolean is CONFIG (3) with the fix, not a runtime failure" | held |

The `seniority` move is checked: `.sdlc/intents/seniority/spec.md` R7 reads "`extends` …
resolves relative to the extending file or through `node_modules`, … and the chain appears
in `explain`". Its § What is built marks R7 built on `config.test.ts`, which holds neither
half, so the move lands on an open item and does not close one.

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
| commander front-end config/`--explain` | not yet — provenance only; `withEnv` for commander syntax is the next slice (2026-10-18: still not built; R3 façade half remaining, § Restated 2026-10-18) | — |

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
