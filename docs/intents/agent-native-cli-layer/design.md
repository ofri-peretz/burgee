# Design — An agent-native layer on top of commander and yargs

Intent: [`intent.md`](./intent.md). **Status:** draft.

> Stage 2 artifact. Requirements are the floor; the design is how the runtime and the
> lint plugin each hold it; verification is the one command that goes red.

---

## Requirements — the CLI floor (v1)

Each requirement names the issue evidence, whether the **runtime** (R) guarantees it
or the **lint** rule (L) enforces it, and the agent cost it removes.

### Discoverability

| # | Requirement | Evidence | Holds | Agent cost removed |
| :-- | :-- | :-- | :-- | :-- |
| F1 | `--schema` prints the full command tree (commands, options, types, defaults, env bindings, examples, deprecations, exit codes) as JSON | yargs #1005, #2121; citty #117, #94; clack #525 | R | One call replaces a `--help` walk per subcommand |
| F2 | `--help --json` prints help as data; text help is rendered *from* that data | yargs cluster 2 (20+ issues) | R | No prose parsing; renderer bugs become template fixes |
| F3 | Every command declares a description and ≥1 example; examples are single-line copy-pasteable | yargs #877, #1640, #1047 | L | Agent can act on the example directly |
| F4 | Commands may be grouped and hidden; help groups are stable in the schema | yargs #684 (top issue), citty #93 | R | Agent filters by group instead of reading all |

### Output

| # | Requirement | Evidence | Holds | Agent cost removed |
| :-- | :-- | :-- | :-- | :-- |
| O1 | `--json` on every command; one envelope `{ ok, data, error?, meta }` | citty #187; yargs #1605 | R + L (`require-json-output`) | Zero parsing, zero ANSI tokens |
| O2 | No ANSI, spinners, progress redraws or prompts when `stdout` is not a TTY or `NO_COLOR` is set; `FORCE_COLOR` overrides | clack #286, #510, #585 | R + L (`no-console-in-command`) | Captured logs stay one line per event |
| O3 | Command code writes through the output layer, never `console.*`, so O1 and O2 are honoured | oclif/core #1644 shows the drift when this is not enforced | L | |
| O4 | Colour via `util.styleText`; no chalk dependency in the layer | oclif/core #1627 | R + L (`prefer-native-style-text`, in modernization) | |
| O5 | stdout is flushed before any exit path | yargs #1519, #2118 | R | No truncated JSON |

### Errors and lifecycle

| # | Requirement | Evidence | Holds | Agent cost removed |
| :-- | :-- | :-- | :-- | :-- |
| E1 | Exit codes are a contract: 0 ok, 1 runtime failure, 2 usage error, 3 config/env error, 4 cancelled, 130 SIGINT; no other literal | yargs #2394 confusion between 1 and 2 | R + L (`exit-code-constant`, `no-process-exit-in-handler`) | Agent branches on code, not on text |
| E2 | A runtime failure never prints help; a usage error never prints a stack | yargs #2394 | R + L (`no-help-on-runtime-error`) | Kills the most expensive misdiagnosis |
| E3 | Every error carries `code`, `message`, `hint`, and where possible `fix`: the exact command or flag to run next | yargs #2481, #1864 | R | One retry instead of two or three |
| E4 | Lifecycle is explicit: parse → load config → validate → run → render → exit; validation failure stops the handler; async handlers are awaited | yargs #1069, #1975, #1797, #1399, #2223 | R | |
| E5 | SIGINT restores the terminal and exits 130 | clack #573, #408; oclif/oclif #958 | R | |

### Values and precedence

| # | Requirement | Evidence | Holds | Agent cost removed |
| :-- | :-- | :-- | :-- | :-- |
| V1 | Precedence flags > env > config file > default, applied per command in strict mode without leaking env into unrelated commands | yargs #873 (22 comments), #858, #1782 | R | |
| V2 | Every option may declare its env name; env-bound options appear in help and schema | yargs #1655, #1681, #1935, #2005 | R + L (`env-option-documented`) | Agent sets env instead of guessing |
| V3 | `--explain <option>` (and `meta.provenance` in JSON) reports where each value came from | yargs #1334; oclif/core #854, #1639 | R | Config debugging in one call |
| V4 | `name`/`version`/`description` resolved from the *owning* `package.json`, not the monorepo root | yargs #2400, #1934; commander #2346; citty #200 | R | |
| V5 | Reserved option names (`help`, `version`, `json`, `schema`, `explain`, `no-color`) cannot be redefined | yargs #1323, #1864, #2199, #2064, #887 | L (`no-reserved-option-names`) | Removes a silent-failure class |

### Validation

| # | Requirement | Evidence | Holds |
| :-- | :-- | :-- | :-- |
| S1 | Options and positionals are declared once as a schema (Standard Schema compatible); TypeScript types and help are derived from it | yargs TS cluster 5; citty #244 | R |
| S2 | Relationships are first-class: `exactlyOneOf`, `atLeastOneOf`, `implies` (value-aware), `conflicts`; validated before choices | yargs #1093, #439, #1322, #898, #1186 | R |
| S3 | Invalid numbers fail validation, never `NaN`; invalid `type` names fail at definition time | yargs #1079, #1198 | R |
| S4 | `-` means stdin for file-typed positionals; `--` pass-through is preserved to child processes | yargs #1312 (17 reactions); commander #2530 | R |

### Prompts

| # | Requirement | Evidence | Holds |
| :-- | :-- | :-- | :-- |
| P1 | Every prompt is backed by a flag; a flag value skips the prompt | clack #167; oclif/oclif #1492 | L (`no-prompt-without-flag`) |
| P2 | In a non-TTY the prompt becomes an E3-style error naming the flag, exit 2 | clack #533 | R |

### Deprecation and evolution

| # | Requirement | Evidence | Holds |
| :-- | :-- | :-- | :-- |
| D1 | Deprecating a command or option requires a replacement, shown in help, schema and the warning | yargs #2115, #2246, #2248 | R + L (`deprecated-requires-replacement`) |
| D2 | Completions for bash, zsh, fish, PowerShell are generated statically from the schema | yargs #1904, #1290, #1684, #2402 | R |

### Testing

| # | Requirement | Evidence | Holds |
| :-- | :-- | :-- | :-- |
| T1 | A CLI can be run in-process with injected `argv`, `env`, `stdin`, `cwd`, and TTY-ness, returning `{ code, stdout, stderr, json }` | commander #2549; yargs #2450 | R |

---

## Design

### Shape

A turborepo (npm workspaces, turbo, lefthook, commitlint, changesets when the first
package publishes), matching `interlace/` and `eslint/`. **Everything lives in this
repo**: the extensions, their shared contract, the lint plugin, the examples, the
benchmark and the docs. **Every public package is an extension of one host parser,
named and built in that host's idiom**, so a commander user finds `commander-*` and a
yargs user finds `yargs-*`, exactly as ESLint users find `eslint-plugin-*`. What the
extensions share — the exit-code contract, the JSON envelope, the error type, the
manifest schema — lives in one internal scoped package, the way
`@interlace/eslint-devkit` sits under the unscoped plugins.

Host idioms the extensions use, never bypass:

| Host | Extension surface |
| :-- | :-- |
| commander | `program.hook('preAction')`, `exitOverride()`, `configureOutput()`, `configureHelp()`, `showHelpAfterError(false)`, `Command` subclassing; commander #2505 (plugin API RFC) is the thread to join |
| yargs | `.middleware()`, `.fail()`, `.showHelpOnFail(false)`, `.exitProcess(false)`, `.parserConfiguration()`, `.completion()`; internals only where nothing public exists |

```
cli/
  apps/
    docs/                     Next.js + fumadocs; the floor, the research, every rule
  packages/
    cli-core/                 @interlace/cli-core — internal; ExitCode, envelope, CliError,
                              manifest schema. Zero deps. Never imports a parser.
    commander-agent/          --schema, --json envelope, E1–E5, non-TTY quiet, fix hints
    yargs-agent/              the same floor, as yargs middleware + fail handler
    commander-schema/         S1–S3 (Standard Schema → options, types, help data)
    commander-env/            V1–V3 (yargs has .env(); commander does not)
    commander-completions/    D2 (yargs has .completion(); commander does not)
    commander-json/, yargs-json/        O1 alone, for CLIs that want only the envelope
    commander-prompts/, yargs-prompts/  P1–P2
    commander-harness/, yargs-testing/  T1 (commander-testing is taken on npm)
    eslint-plugin-cli/        the L rules; depends on @interlace/eslint-devkit
  examples/
    demo-cli-commander/, demo-cli-yargs/   the same CLI twice; one test suite runs both
  benchmarks/
    agent-cli-bench/          task set + runner (claude -p) + results JSON
  docs/intents/               this
  docs/research/              competitor-open-issues.md + raw snapshots
  evals/                      layer 1 (link + pointer checks), as in eslint/
  .agent/control-bands.json   agent-tokens-per-task, agent-turns-per-task
```

Not every layer needs both hosts: a package exists only where the host lacks the
feature. The list above is the ceiling, not the plan; see "Order of work".

The only change outside this repo: `eslint-config-interlace` (eslint monorepo) gains a
`cli` preset that depends on the published `eslint-plugin-cli` and composes it with
`quality` + `node-security` + `secure-coding`.

### The agent efficiency mechanism, precisely

An agent calling a CLI through Bash pays in three currencies: **calls** (each a
turn), **tokens** (everything on stdout enters context) and **misreads** (a wrong
inference costs further turns). The layer attacks each:

| Mechanism | Calls | Tokens | Misreads |
| :-- | :-- | :-- | :-- |
| F1 `--schema` once | −(subcommands−1) `--help` calls | | |
| O1 JSON envelope | | no prose, no ANSI, no alignment whitespace | no parsing |
| O2 quiet in non-TTY | | no spinner frames, no `\r` redraw lines | |
| E2 no help on runtime error | | −help text per failure | the big one |
| E3 `fix` in every error | −1 to −2 per failure | | |
| V3 `--explain` | −N config-hunt calls | | |
| P2 prompt → error | −∞ (hang) | | |
| `agent.ts` MCP tool defs | Bash removed entirely | | |

`benchmarks/agent-cli-bench` fixes a task set (install a thing, change a config
value, diagnose a wrong value, run a failing command and recover, discover an
unfamiliar subcommand) against `examples/demo-cli` built twice: plain commander
and layered. The runner uses `claude -p` with `--allowedTools 'Bash'` and records
tokens and turns from the JSON output. Results land in `benchmarks/results/*.json`
and feed the two control bands.

### Dogfooding the ecosystem

`eslint.config.mjs` follows `interlace/eslint.config.mjs` (which hand-wires the
plugins because the meta-config's published `recommended` was broken at the time):

| Plugin | Preset | Why it applies |
| :-- | :-- | :-- |
| eslint-plugin-import-next, -conventions, -maintainability, -reliability, -operability, -modularity, -modernization | every rule at `error` | all runtime TypeScript |
| eslint-plugin-node-security | every rule at `error` | child processes, fs, env |
| eslint-plugin-secure-coding | every rule at `error` | injection, PII in logs, regex |
| eslint-plugin-react-a11y, -react-features | every rule at `error`, `apps/docs/**/*.tsx` | the docs site |
| eslint-plugin-cli | recommended | the floor itself |
| @interlace/eslint-devkit | builds eslint-plugin-cli | |

Not applicable and recorded as such: browser-security (no browser code outside
Next's own), express-security, nestjs-security, mongodb-security, pg, jwt,
lambda-security, vercel-ai-security. Eight of twenty-four packages are excluded
because their targets are not present, not because of any conflict. That is 12 of 24
packages consumed at Stage 0, 14 once the plugin and devkit are in play.

Not consumed, deliberately: `@interlace/eslint-formatter-sarif`. In `eslint/` it is
`private: true` since PR #105, its `main` points at a `dist/` no build script produces,
and it has never been on npm. Whether to publish it is an eslint-repo decision; this repo
uploads nothing to code scanning until that is made, and would use
`@microsoft/eslint-formatter-sarif` if plain SARIF were ever enough.

### Order of work

1. **Stage 0 (this PR):** repo skeleton, this intent + design, research file, the
   raw snapshots, `scripts/fetch-competitor-issues.sh`, dogfooding lint config,
   `docs/intents/` lock test, evals layer 1.
2. **`commander-agent` v0.1:** F1, F2, O1–O5, E1–E5 on `examples/demo-cli-commander`,
   built only on commander's public hooks. The in-process harness (T1) ships first
   because every other requirement is tested through it. E1 already landed in
   `@interlace/cli-core` with the scaffold.
2b. **`yargs-agent`** as soon as 2 is green: `examples/demo-cli-yargs` must pass the
   same test suite. That suite is the contract between the two extensions.
3. **`eslint-plugin-cli` v0.1** in `packages/eslint-plugin-cli`: the 10 L rules on
   `@interlace/eslint-devkit`, fixtures generated from both demo CLIs. First run against `interlace-ui` and the
   eslint repo's scripts; findings become the launch article.
4. **v0.2:** V1–V5, S1–S4. **v0.3:** P1–P2, D1–D2. **v0.4:** `agent.ts` MCP export.
5. **Benchmark + control bands** as soon as v0.1 runs; the number is the pitch.

### Verification

- `npm test` at the root exits non-zero on: any requirement's unit test, the
  `--schema` shape lock, the non-TTY output lock (runs the demo through a pipe and
  asserts no ANSI, no `\r`, no prompt), the intents lock, evals layer 1.
- `benchmarks/agent-cli-bench` runs weekly and on `packages/**` changes; a 2σ
  regression in tokens-per-task writes a Stage 1 intent, as in `eslint/`.
- For the L rules: RuleTester suites in `packages/eslint-plugin-cli` under the same
  `npm test`, plus a lock that every rule named in this design exists in the plugin's
  manifest.

## Rejected alternatives

- **A new parser competing with commander/yargs.** Downloads are transitive; every
  new entrant with distribution (citty, brocli, stricli, clipanion, cac) is flat.
  commander is stable, zero-dep and maintained. Nothing to win, everything to
  maintain. See intent, "Why now".
- **Forking or vendoring commander to fix parsing edge cases.** Every parsing issue
  we found is either fixed upstream or minor. A fork forfeits the transitive
  ecosystem the layer exists to ride.
- **One umbrella package** (`@interlace/cli` or `interlace-cli` with subpaths). A
  commander user searches npm for `commander-*`; a yargs user for `yargs-*`. An
  umbrella hides the extensions from the people they are for, and a scoped name says
  "ours" where the whole point is "theirs, extended". Same reason the plugins are
  `eslint-plugin-*`, not `@interlace/eslint`.
- **The lint plugin in the eslint monorepo.** It would sit next to the devkit and the
  publish gates, but its fixtures are this repo's demo CLIs and its rules change with
  the runtime. One repo, one `npm test`, one PR per floor change.
- **Supporting only commander.** yargs has the larger backlog of layer-shaped
  requests and a comparable install base; an adapter is cheap once the core is
  parser-agnostic, and two adapters prove the core actually is.
- **Building on citty or oclif instead.** citty has no completions, no manifest and
  3 releases in 24 months. oclif has the manifest idea but 17 runtime dependencies
  and Salesforce-shaped conventions; its flat adoption is the market's verdict on
  "framework".
- **Lint only, no runtime.** Lint cannot give an agent `--schema` or a JSON
  envelope; it can only demand that someone write them. Runtime only cannot reach
  the thousands of existing CLIs. Both, or the floor is not a floor.
- **A custom colour library.** `util.styleText` exists; oclif/core #1627 is the cost
  of not using it.
- **Starting with prompts (clack wrapper).** The agent thesis says prompts are the
  thing to *remove* from the agent path; P1/P2 need only a flag-equivalence rule and
  a non-TTY error. Wrapping clack is a v0.3 decision.

## Out of scope

- Argv parsing semantics of any kind.
- Terminal UI frameworks (ink-style rendering), TUIs, dashboards.
- Packaging and distribution of CLIs (tarballs, installers, brew formulae).
- Deno and Bun support beyond "does not break"; Node 24 is the target.
- A hosted service, telemetry, or update checker.
- Migrating the three internal CLIs beyond running the lint plugin on them.
