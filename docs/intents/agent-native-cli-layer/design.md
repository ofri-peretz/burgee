# Design — An agent-native layer on top of commander and yargs

Intent: [`intent.md`](./intent.md). **Status:** draft.

> Stage 2 artifact. Requirements are the floor; the design is how the runtime and the
> lint plugin each hold it; verification is the one command that goes red.

---

## The shape lock — why this is a better commander and not another oclif

Everything below (a manifest, plugins, generated surfaces) is also oclif's architecture,
and oclif lost: **10.9M downloads a week against commander's 508M**, after eight years
and with Salesforce behind it. The difference is not features. It is that oclif is a
*framework* — it requires a project structure, a build step, a generator and eighteen
runtime dependencies — while commander is a *library* you install and use in one file.

The floor's capabilities are worth having. Adopting oclif's shape to get them is the
single most likely way this project fails. So the shape is locked, first, ahead of every
other requirement:

| # | Requirement | Holds |
| :-- | :-- | :-- |
| Z1 | A working CLI is **one file**: `npm i`, write it, run it. No build step, no config file, no directory convention, no codegen, no scaffold | lock |
| Z2 | Every capability beyond Z1 is **additive and removable**: precomputed manifests, lazy loading, plugins, the dev loop, scaffolding. Deleting any of them leaves a working CLI | lock |
| Z3 | Zero runtime dependencies (K1). oclif ships 18 | lock |
| Z4 | The first example in the README is **15 lines or fewer** and has no build step | lock |
| Z5 | The manifest is computed **in memory at startup by default**. Precomputing it is an opt-in optimisation for large CLIs, never a prerequisite | R + bench |

**Z1 is a real test, not a principle.** `packages/cli-core/src/shape.test.ts` creates a
temporary directory, installs the built tarball, writes exactly one file, runs it, and
asserts the output. If that test ever needs a second file, a config, or a build step to
pass, the project has become oclif and the test fails.

**Z5 is the design consequence.** The build-time manifest earns its place only for the
250-command case (yargs #1005), so it is an optimisation with a benchmark attached, not
the way commands are declared. A five-command CLI computes its manifest in microseconds
at startup and never knows the build step exists.

The reference point to keep in view: a commander user's first line is
`new Command()`. Ours must be equally short, in one file, with nothing installed but us.

---

## Requirements — the CLI floor

79 requirements: the shape lock (Z1–Z5), the original 26 (F/O/E/V/S/P/D/T), 27 folded in from the gap-track
intents on 2026-09-06 (S5–S8, V6–V7, H1–H6, D3–D5, P3, M1–M6, K1–K5), and 27 added the
same day with the compatible-replacement strategy and the architecture review
(K6, C1–C6, B1–B7, N1–N5, J1–J9). Each names the
issue evidence, whether the **runtime** (R) guarantees it or the **lint** rule (L)
enforces it, and where it lands.

### Discoverability

| # | Requirement | Evidence | Holds | Agent cost removed |
| :-- | :-- | :-- | :-- | :-- |
| F1 | `--schema` prints the full command tree (commands, options, types, defaults, env bindings, examples, deprecations, exit codes) as JSON, carrying a `schemaVersion` and validating against a JSON Schema published with the package | yargs #1005, #2121; citty #117, #94; clack #525 | R | One call replaces a `--help` walk per subcommand |
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

### Validation, continued (from `commander-schema`)

| # | Requirement | Evidence | Holds | Lands in |
| :-- | :-- | :-- | :-- | :-- |
| S5 | Every option has exactly one declared type and one canonical camelCase key; kebab-case is derived | yargs #1679, #887, citty #244 | R | commander-schema |
| S6 | Relations are validated before choices and before the handler | yargs #1186 | R | commander-schema |
| S7 | A `flag` type never consumes a value | yargs #1532, #933 | R | commander-schema |
| S8 | `multiple` options accept repetition and a declared separator | yargs #846, #1318 | R | commander-schema |

### Values, continued (from `commander-env`)

| # | Requirement | Evidence | Holds | Lands in |
| :-- | :-- | :-- | :-- | :-- |
| V6 | Config discovery order is fixed, documented, and shown by `--explain` | yargs #1234, #1676, #2191 | R | commander-env |
| V7 | `extends` merges deeply and resolves from the extending file's `node_modules` | yargs #1363, #1135 | R | commander-env |

### Help (from `cli-help-renderer`)

| # | Requirement | Evidence | Holds | Lands in |
| :-- | :-- | :-- | :-- | :-- |
| H1 | Help is rendered from the manifest only, never from host help classes | yargs cluster 2 | R | cli-core |
| H2 | Examples are single-line and copy-pasteable | yargs #877, #1640 | R + L (`require-command-example`) | cli-core, eslint-plugin-cli-floor |
| H3 | Width comes from the runtime, default 100 in non-TTY | yargs #2003, #2204 | R | cli-core |
| H4 | Command options render before global options | yargs #1181 | R | cli-core |
| H5 | Deprecations and env names render inline | yargs #2248, #1935 | R | cli-core |
| H6 | Type hints are off by default | yargs #969, #427 | R | cli-core |

### Deprecation and completions, continued (from `commander-completions`)

| # | Requirement | Evidence | Holds | Lands in |
| :-- | :-- | :-- | :-- | :-- |
| D3 | Completions never execute the CLI unless an option is marked `--dynamic` | yargs #1965, #1684 | R | commander-completions |
| D4 | Every shell script is snapshot-pinned and exercised by that shell in CI | yargs #2254, #1277, #1133 | R | commander-completions |
| D5 | A Fig spec is exported from the same node | yargs #2131, citty #59 | R | commander-completions |

### Prompts, continued (from `cli-prompts`)

| # | Requirement | Evidence | Holds | Lands in |
| :-- | :-- | :-- | :-- | :-- |
| P3 | Cancellation exits `CANCELLED` (4), never `RUNTIME` | clack #83, #573 | R | cli-prompts |

### Modularity (from `cli-modularity`)

| # | Requirement | Evidence | Holds | Lands in |
| :-- | :-- | :-- | :-- | :-- |
| M1 | Every command carries a group | yargs #684 | R | commander-agent |
| M2 | The manifest is complete before any handler module loads | yargs #1067, #2479 | R | commander-agent |
| M3 | Every plugin's contributions are attributed in the manifest | commander #2505 | R | commander-agent |
| M4 | Shared options are declared once and copied per command | commander #2583, citty #154 | R | commander-agent |
| M5 | A deprecated command names its replacement in help, schema and warning | yargs #2115, #2246 | R + L (`deprecated-requires-replacement`) | commander-agent |
| M6 | `resolveCommand` and `runCommand` are public | yargs #1838, #1605 | R | commander-agent |

### Packaging (from `cli-packaging`)

| # | Requirement | Evidence | Holds | Lands in |
| :-- | :-- | :-- | :-- | :-- |
| K1 | Zero runtime dependencies in every layer package; hosts and UI libraries are peers | oclif/core #1627 | lock | all |
| K2 | ESM only, Node ≥ 24 | oclif/core #1450, #1396 | lock | all |
| K3 | Node natives over packages (`util.styleText`, `fs.glob`, `fetch`) | oclif/core #1627 | L (`prefer-native-style-text`) + lock | all |
| K4 | An artifact gate runs on the built `dist/` before publish; every package publishes with npm provenance via trusted publishing | eslint SARIF formatter incident; @oclif/core's 18 runtime deps | release.yml | all |
| K5 | Per-package size budget, ratcheted | eslint `artifact-size-baseline.json` | lock | all |
| K6 | Weight is paid per import: compat and host quirks live behind their own specifiers, never behind a runtime flag | competitor map §6 | lock + B4 | cli-packaging |

### The adoption ladder (from `commander-compat` / `yargs-compat`)

Added 2026-09-07. Someone on commander or yargs must be able to keep writing the syntax
they already know, gain burgee's capabilities on day one without rewriting anything, and
adopt native syntax gradually in the same program — three rungs, and a user may stand on
more than one at once.

The mechanism is that `burgee/commander` is a **façade over burgee's engine**, not a
wrapper around real commander. A command declared through commander's API lands in the
same manifest as a native `defineCommand`, and every surface is a projection of that
manifest — so the surfaces do not care which façade populated it.

| # | Requirement | Evidence | Holds | Lands in |
| :-- | :-- | :-- | :-- | :-- |
| J1 | A commander or yargs program keeps its syntax unchanged and its own test suite passing, graded by C2 | vitest→jest migration | R | commander-compat |
| J2 | Purely **additive** surfaces — `--json`, `--schema`, `--mcp`, completions — are available on day one with no code change, because they are projections of the manifest the façade already fills | competitor map §5 | R | commander-compat |
| J3 | Anything that changes **existing observable behaviour** — the exit-code contract, no-help-on-runtime-error — is off by default and enabled by one explicit call. The hosts' own suites assert the old behaviour, so silently changing it would fail C2 and break real users | commander's 1,215 tests assert help output | R | commander-compat |
| J4 | If a program already defines a name burgee reserves (`json`, `help`, `schema`), the program wins and burgee's surface is withheld, reported by `--schema` | V5 | R + L | commander-compat |
| J5 | Native `defineCommand` and façade commands compose in one program, so a user can write the next command in burgee syntax without moving the previous ones | the ladder is only real if the rungs mix | R | commander-compat |
| J6 | Both paths are graded separately: the strict path against the host's own suite (C2), the enhanced path against burgee's conformance suite | a single suite cannot assert both behaviours | CI | compat-oracle |
| J7 | A plugin works identically whichever syntax the host program is written in — commander, yargs or native — because it contributes to the manifest and the manifest does not record which façade filled it. One plugin, every rung | commander #2505 (plugin RFC, unlanded); yargs has none | R | cli-modularity |
| J8 | Plugin hooks fire on commander- and yargs-syntax programs exactly as on native ones. The façades are ours, so the lifecycle hook points (`preRun`, `postRun`, `onError`) exist on every rung by construction, not by adapter | J7 | R | cli-modularity |
| J9 | The façades depend on nothing: commander's 151 methods and yargs' 108 are implemented over burgee's engine in our source, never wrapped around the real packages. The real ones exist only inside `compat-oracle`, private and never published | K1, weight lock | lock | commander-compat, yargs-compat |

**Why J3 is not negotiable.** commander's suite asserts help text and exit behaviour. A
compat front-end that changed them by default would fail the very tests the compatibility
claim rests on. So the free tier is strictly additive, and the behavioural floor is one
line away rather than zero — which is still a far shorter migration than a rewrite.

### Compatibility (from `compat-oracle`)

Added 2026-09-06 with the compatible-replacement strategy. Every claim about a host is
graded by that host's own suite, so "compatible" is a number rather than an adjective.

| # | Requirement | Evidence | Holds | Lands in |
| :-- | :-- | :-- | :-- | :-- |
| C1 | Every package declares a supported host range; the host's own suite runs against it at every supported major | competitor map §5 | CI | compat-oracle |
| C2 | A compat front-end is graded by the host's own suite through a one-line shim; the rate is published per release | measured 1,210/1,215 on 2026-09-06 | CI | compat-oracle |
| C3 | Every package is tested on every Node LTS in its `engines` range, across Linux, macOS and Windows | oclif/core #1450, #1396 | quality-full.yml | compat-oracle |
| C4 | Every intentional divergence has an id, a written reason and a test asserting it; an unlisted failure is a bug | vitest's jest-differences page | lock | compat-oracle |
| C5 | Pass rates ratchet; lowering one needs a baseline edit with a reason | eslint baseline pattern | CI | compat-oracle |
| C6 | Vendored suites record their upstream commit; a scheduled job opens a PR when the count changes | the treadmill is permanent cost | workflow | compat-oracle |

### Benchmarks (from `cli-benchmarks`)

Added 2026-09-06. Four axes, because we make four kinds of public claim and three of
them had no scheduled measurement.

| # | Requirement | Evidence | Holds | Lands in |
| :-- | :-- | :-- | :-- | :-- |
| B1 | Agent cost: tokens, turns and success per task, layer on vs off | the umbrella's own ≥40%/≥30% claim | band | cli-benchmarks |
| B2 | Performance: cold start p50/p95 over ≥30 spawns, always including a bare-node floor row | competitor map §2 | band | cli-benchmarks |
| B3 | Compatibility: per-host pass rate, read from `compat-oracle`, never recomputed | C2 | band | cli-benchmarks |
| B4 | Weight: bundled KB per entry point against a published target; core-only import pulls zero front-end bytes | competitor map §6 | band | cli-benchmarks |
| B5 | Every axis emits one JSON shape; one collector reads all of them | — | lock | cli-benchmarks |
| B6 | B2/B3/B4 gate every PR; B1 runs weekly | cost and noise | CI | cli-benchmarks |
| B7 | Every public number links to the generated `/benchmarks` page | a published target with no measurement decays into a slogan | lock | cli-benchmarks, docs-deploy |

### Agent interface (from `cli-mcp`)

Added 2026-09-06. The manifest already carries everything an MCP tool definition needs;
these requirements turn that into a served interface rather than a document.

| # | Requirement | Evidence | Holds | Lands in |
| :-- | :-- | :-- | :-- | :-- |
| N1 | `--mcp` serves the CLI over MCP stdio; tool definitions are generated from the manifest, never hand-written | citty #187; yargs #1605, #1838, #2121 | R | cli-mcp |
| N2 | A command appears as a tool only if it opts in; destructive commands default to absent | security posture, not convenience | R + L | cli-mcp |
| N3 | Zero runtime dependencies: JSON-RPC over stdio against `node:readline` | K1 | lock | cli-mcp |
| N4 | Tool results are the O1 envelope, so MCP and `--json` callers see identical payloads | O1 | R | cli-mcp |
| N5 | `--mcp` implies non-TTY: no prompts, no colour, E3 errors | O2, P2, E3 | R | cli-mcp |

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
    commander-harness/, yargs-harness/  T1 (commander-testing is taken on npm)
    eslint-plugin-cli-floor/        the L rules; depends on @interlace/eslint-devkit
  examples/
    demo-cli-commander/, demo-cli-yargs/   the same CLI twice; one test suite runs both
  benchmarks/
    agent-cli-bench/          task set + runner (claude -p) + results JSON
  docs/intents/               this
  docs/research/              competitor-open-issues.md, competitor-landscape.md
  evals/                      layer 1 (link + pointer checks), as in eslint/
  .agent/control-bands.json   agent-tokens-per-task, agent-turns-per-task
```

Not every layer needs both hosts: a package exists only where the host lacks the
feature. The list above is the ceiling, not the plan; see "Order of work".

The only change outside this repo: `eslint-config-interlace` (eslint monorepo) gains a
`cli` preset that depends on the published `eslint-plugin-cli-floor` and composes it with
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
| eslint-plugin-cli-floor | recommended | the floor itself |
| @interlace/eslint-devkit | builds eslint-plugin-cli-floor | |

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

### Order of work — waves

Each wave starts when the previous wave's intents are `shipped`; intents inside a wave
are independent and can run in parallel sessions (one worktree each, split by package).

| Wave | Intents | Why here |
| :-- | :-- | :-- |
| 0 | `sdlc-locks-evals-bands`, `cli-testing-harness` | the lock guards every later status change; the harness is what every later test runs through |
| 1 | `commander-agent`, `cli-packaging` | the first extension, and the artifact gate before the first publish |
| 2 | `yargs-agent`, `eslint-plugin-cli-floor`, `docs-deploy`, `cli-help-renderer` | second host proves the core; lint holds the floor; the site publishes it; help is data by now |
| 3 | `agent-cli-bench`, `commander-schema`, `commander-env` | the number (needs two hosts for four cells); declare-once; precedence and provenance |
| 4 | `commander-completions`, `cli-prompts`, `cli-modularity` | each depends on the manifest and schema being stable |

Prerequisites that only the owner can supply, needed before the wave that uses them:
`NPM_TOKEN` or npm Trusted Publishing for each package (wave 1), `CLAUDE_CODE_OAUTH_TOKEN`
(review now, benchmark in wave 3), `VERCEL_TOKEN` plus the Vercel project and DNS for
`cli.interlace.tools` (wave 2), a `windows-latest` and `macos-latest` runner budget for
the conformance matrix (wave 1).

### Verification

- `npm test` at the root exits non-zero on: any requirement's unit test, the
  `--schema` shape lock, the non-TTY output lock (runs the demo through a pipe and
  asserts no ANSI, no `\r`, no prompt), the intents lock, evals layer 1.
- `benchmarks/agent-cli-bench` runs weekly and on `packages/**` changes; a 2σ
  regression in tokens-per-task writes a Stage 1 intent, as in `eslint/`.
- For the L rules: RuleTester suites in `packages/eslint-plugin-cli-floor` under the same
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
