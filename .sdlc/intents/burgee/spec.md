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
| Z3 | No runtime dependency outside the family (K1, restated by the owner 2026-09-23, D-111). oclif ships 18 | lock |
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

**114 requirements**, counted 2026-09-16 by reading every row of every table below. This
paragraph said *92*, and the arithmetic it recites is kept here because it says when each
wave arrived: the shape lock (Z1–Z5), the original 26 (F/O/E/V/S/P/D/T), 27 folded in from
the gap-track intents on 2026-09-06 (S5–S8, V6–V7, H1–H6, D3–D5, P3, M1–M6, K1–K5), and 27
added the same day with the compatible-replacement strategy and the architecture review
(K6, C1–C8, B1–B7, N1–N10, J1–J9), and 13 added 2026-09-08 with the output stack
(U1–U13, from `cli-output-stack`). It is wrong twice over: `E6 E7 V8 N11–N15` were added
after it was last totalled, and `C1–C8` names two rows the compatibility table does not
have — it holds C1–C6. Each requirement names the issue evidence, whether the **runtime**
(R) guarantees it or the **lint** rule (L) enforces it, and where it lands; what is
*built* is in [What is built, requirement by
requirement](#what-is-built-requirement-by-requirement-2026-09-16).

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
| E1 | Exit codes are a contract: 0 ok, 1 runtime failure, 2 usage error, 3 config/env error, 4 cancelled, 130 SIGINT; no other literal | yargs #2394 confusion between 1 and 2 | R + L (`exit-code-constant`, `no-process-exit-in-handler`) + **lock** (`scripts/exit-code-lock.test.ts`: no bare literal at an exit site outside the two front-ends, and every exit constant any package declares is one of the six) | Agent branches on code, not on text |
| E2 | A runtime failure never prints help; a usage error never prints a stack | yargs #2394 | R + L (`no-help-on-runtime-error`) | Kills the most expensive misdiagnosis |
| E3 | Every error carries `code`, `message`, `hint`, and where possible `fix`: the exact command or flag to run next | yargs #2481, #1864 | R | One retry instead of two or three |
| E4 | Lifecycle is explicit: parse → load config → validate → run → render → exit; validation failure stops the handler; async handlers are awaited | yargs #1069, #1975, #1797, #1399, #2223 | R | |
| E5 | SIGINT restores the terminal and exits 130 | clack #573, #408; oclif/oclif #958 | R | |
| E6 | The taxonomy separates **usage** from **environment** from **remote**: you typed it wrong, your environment is wrong, the far side said no. Each implies a different response — fix the script, fix the runner, retry or escalate — and `AUTH` is its own code, the most actionable single code in the survey | aws v2 252/253/254; gh 4 | R + L | commander-agent → engine |
| E7 | The exit-code taxonomy is **declarative**: an author classifies an error and the framework maps it to a stable code. Reusing a code across two classes is a startup failure, not a runbook footnote | oxlint collapses a 20-variant enum to {0,1} | R + lock | engine |

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
| V8 | The precedence table and a `config explain` command are **generated** from the resolver, not hand-written. Ten of ten CLIs surveyed have config and env; **three of ten document the precedence** | the widest doc gap in the survey | R | commander-env |

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

### Prompts, continued (from `caique`)

| # | Requirement | Evidence | Holds | Lands in |
| :-- | :-- | :-- | :-- | :-- |
| P3 | Cancellation exits `CANCELLED` (4), never `RUNTIME` | clack #83, #573 | R | caique |

### Modularity (from `cli-modularity`)

| # | Requirement | Evidence | Holds | Lands in |
| :-- | :-- | :-- | :-- | :-- |
| M1 | A command may carry a group, and help renders commands under their group (restated 2026-09-23, D-112) | yargs #684 | R | commander-agent |
| M2 | The manifest is complete before any handler module loads | yargs #1067, #2479 | R | commander-agent |
| M3 | Every plugin's contributions are attributed in the manifest | commander #2505 | R | commander-agent |
| M4 | Shared options are declared once and copied per command | commander #2583, citty #154 | R | commander-agent |
| M5 | A deprecated command names its replacement in help, schema and warning | yargs #2115, #2246 | R + L (`deprecated-requires-replacement`) | commander-agent |
| M6 | `resolveCommand` and `runCommand` are public | yargs #1838, #1605 | R | commander-agent |

### Packaging (from `cli-packaging`)

| # | Requirement | Evidence | Holds | Lands in |
| :-- | :-- | :-- | :-- | :-- |
| K1 | Every published package depends only on in-family packages — as a dependency, a peer or an optional dependency; nothing from outside this repository (restated by the owner 2026-09-23, D-111) | oclif/core #1627 | lock | all |
| K2 | ESM source, Node ≥ 24 — and **consumable from CommonJS**: every entry exposes a `default` condition beside `import`, and the library has no top-level await, so `require()` loads the same file via `require(esm)`. One artifact, both module systems, asserted by installing the tarball and requiring it | oclif/core #1450, #1396; a CJS commander user must still be able to change one import | lock | all |
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
| B1 | Agent cost: tokens, turns and success per task, layer on vs off. **A hypothesis to test, not a target to defend** — JetBrains' 425-trial study found output filtering *raised* cost 7.6% because cached re-reads bill at a tenth. The honest justification for O2/O5/F1 is parse reliability, not token economy | JetBrains 2026-07; arXiv 2607.09510 | band | cli-benchmarks |
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
| N6 | Every command that runs declares `effects: read_only \| idempotent \| non_idempotent \| withheld`, **required not optional**, refused at definition time when absent, and the first three generate MCP's `readOnlyHint`/`idempotentHint`/`destructiveHint`. The spec defaults `destructiveHint` and `openWorldHint` to **true**, so silence is the dangerous reading — and `withheld` is how an author says *not for agents* without that being the same value as having said nothing | MCP `2026-07-28` schema | R + L | cli-mcp |
| N7 | A no-op announces itself: every idempotent command reports `changed: true \| false`. An agent reads silence as success, and a silent failure stays invisible for a median of ~10 steps against a median recovery window of 1 | arXiv 2607.09510, 1,794 trajectories | R | commander-agent → engine |
| N8 | `--schema` succeeds with **no authentication, no config file and no network**. It is the one command an agent runs first, before anything is set up | clispec.dev v0.3 | R + lock | cli-mcp |
| N9 | The manifest carries `enum`, `minimum` and `maximum` as **data**, not as completion callbacks — the four fields a tool definition needs and a flag parser cannot supply | Cobra #2362, the flag/schema gap | R | commander-schema |
| N10 | The floor is measured against **clispec.dev** and **cli-agent-lint**'s 34 checks, and the results published. A floor that fails someone else's published checklist is not a floor | — | CI | cli-benchmarks |
| N11 | **The action-required envelope.** When a prompt would block, emit `{ status, reason, message, next[], hint }` where `next[]` carries runnable commands, each with a `when`, rewritten to include the caller's own global flags. The framework synthesises it from the manifest and argv; no author writes it | vercel is the only CLI of ten that does this | R | cli-mcp → engine |
| N12 | **Agent detection, not just `isTTY`.** Non-interactive is the default under a detected agent (`AI_AGENT` and the 13 vendor variables), with `FORCE_TTY=1` to override. An agent may well have a TTY | `@vercel/detect-agent`; O2/P2 currently key off `isTTY` alone | R | commander-env |
| N13 | `--schema` is **token-budget aware**: full schema under a declared character budget, progressively summarised above it, with field-path drilling to go deeper | posthog-cli `TOKEN_CHAR_LIMIT = 48,000` | R | cli-mcp |
| N14 | Omitting `--json`'s argument **lists the valid fields**; an invalid field prints the valid set. Schema discovery with no extra surface and no drift | gh, alone of ten | R | commander-schema |
| N15 | An `agent` output format that is **not JSON**: one compact line per record, no excerpts, no summary, whitespace collapsed. Agents want low-token and grep-able, which is often neither the human format nor JSON | oxlint and vitest converged independently | R | cli-help-renderer |

---

### The output stack (from `cli-output-stack`)

The same floor, one layer up: what a CLI *shows*, as four independent packages. Full text
and evidence in [`cli-output-stack/intent.md`](../cli-output-stack/intent.md).

| id | Requirement | Evidence | R/L | Lands in |
| :-- | :-- | :-- | :-- | :-- |
| U1 | One package per layer; dependency arrows point up only (restated 2026-09-23, D-130: `burgee → bellpull, closeout, linegauge, roundel, seniority` · `flagstaff → closeout, linegauge, paratext, roundel` · `caique → closeout, linegauge` · the foundation → ∅) | listr2 #771, #708, #676; ora #234 (layers coupled by adapters and peer ranges); layers have different buyers and change rates | lock (`package-shape-lock`) | all |
| U2 | Output policy decided once from `Runtime`: `tty \| pipe \| json \| accessible \| ci`; no component detects the terminal itself | picocolors #100, #85; chalk #624, #614 (declined); cli-table3 #357, #180; listr2 #687, #716; clack #286; ora #218, #235 (declined); ink D#577 | lock + L | roundel |
| U3 | Every styled or animated output has a static projection; a component or plugin without one is refused at registration | clack #585, #510, #533; ink D#734; Inquirer D#1356, D#1699, #1783; ora #116; log-update #59 (declined); listr2 #732, #716 | lock | flagstaff, caique |
| U4 | Plugins are data, inspectable without execution; at most one `frame` function | chalk #666 (declined), #677, #659; clack #36, #345, #379; ora #255, #240; boxen #106, #99, #94; cli-table3 #352, #355; ink D#641; lineage: ESLint flat config | lock | flagstaff, plugin-contract |
| U5 | Conditional weight: one subpath per capability, importing only itself and the policy; per-subpath ceiling is the lightest incumbent | ink #976; picocolors #70; chalk #617; chalk +18 ms, picocolors +10 ms | lock + B4 | all |
| U6 | Zero external runtime dependencies; only same-repo packages allowed | ora #229, #247; chalk #656 (the September 2025 compromise, 80 reactions), #685; ink #976, #978; listr2 #759, #724, #707, #726, #771; log-update #65; cli-table3 #356; K1, K3 | lock | all |
| U7 | Every package has its own Z1 shape test and K5 size ratchet | cli-table3 #357, #356; ora #229; Z1, K5 | lock | all |
| U8 | No layout engine; box, columns and a status line are the ceiling | ora #231 (declined: "try Ink"); ink #765, #222, #676, #660, #870, #251, #834, #978, D#555, D#959 | lock | flagstaff |
| U9 | Agent-authorable plugins: schema in the tarball and `llms.txt`, `check` renders every mode, weekly one-turn eval | clack #533, #525; Inquirer D#1699; ink D#776; the one-turn eval is unmeasured | hypothesis → lock once measured | flagstaff, plugin-contract |
| U10 | ESM + `default` condition, `sideEffects` naming only the files that act when loaded (restated 2026-09-23, D-130), tree-shake fixture: root named import == subpath bytes | picocolors #70 (35 reactions), #50, #59; chalk #632, #633, #641, #628, #627, #620 (declined, every one), #613, #661, #626; ora #239 (declined); listr2 #755, #745; Inquirer D#1270, D#1206; K2, B4 | lock + B4 | all |
| U11 | Every replaced incumbent gets a façade graded by its own suite, pass rate published and ratcheting | picocolors #100, #92; listr2 #676; Inquirer D#1782, D#1471; clack #551, #553, #555, #556, #557; C1–C6 | lock + band | output-stack-compat |
| U12 | Each layer is an independent product: own README leading with its own incumbents, own benchmarks, installs and works alone | no issue; only the download spread in the landscape table (chalk 440M/wk to ink 5.8M/wk, each chosen separately) | hypothesis → lock once measured | all |
| U13 | `burgee`'s optional surfaces reach the family by presence-guarded dynamic `import()` and fall back to the static projection; `import 'burgee'` never resolves a family specifier | ink #976; ora #229; Z3 and U1 both hold | lock (weight `denied`) | burgee |

Issue ids are from [what 230 issues say about the output stack](../../research/output-stack-open-issues.md).
**U9** locks when the weekly one-turn authoring eval reaches the pass rate it states
(proposed: 9 of 10 runs, three consecutive weeks); **U12** locks when the independence
install test passes for every layer and the first adopter installs a layer alone, without
burgee.

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
  .sdlc/intents/               this
  .sdlc/research/              competitor-open-issues.md, competitor-landscape.md
  evals/                      layer 1 (link + pointer checks), as in eslint/
  .sdlc/bands/control-bands.json   agent-tokens-per-task, agent-turns-per-task
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
| 4 | `commander-completions`, `caique`, `cli-modularity` | each depends on the manifest and schema being stable |

Prerequisites that only the owner can supply, needed before the wave that uses them:
`NPM_TOKEN` or npm Trusted Publishing for each package (wave 1), `CLAUDE_CODE_OAUTH_TOKEN`
(review now, benchmark in wave 3), `VERCEL_TOKEN` plus the Vercel project and DNS for
`burgee.interlace.tools` (wave 2), a `windows-latest` and `macos-latest` runner budget for
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

## The surface a consumer gets, derived from the tree (2026-09-15)

A hundred and fourteen requirements say what the floor *is* — this read *"Ninety-two"* until
the list was counted on 2026-09-16. None of them is a list a consumer can scan
to decide what to import. This section is that list, and it is derived rather than
transcribed: one row per entry in `packages/burgee/package.json`'s `exports` map, with the
names read from the source file each subpath's `dist/` path is built from. Re-derive with
`node -p "Object.keys(require('./packages/burgee/package.json').exports)"` and
`grep '^export' packages/burgee/src/<file>.ts`.

| Subpath | What a consumer gets | What it is for |
| :-- | :-- | :-- |
| `burgee` | `defineCommand`, `defineProgram`, `execute`, `run`, `runCommand`, `resolveCommand`, `sharedOptions`, `checkDefinition`, `camel`, `kebab`, `UsageError`; `ExitCode`, `isExitCode`; `renderHelp`; `schemaOf`, `commandSchemaOf`, `inputSchemaOf`, `summaryOf`; `serveMcp`, `toolsOf`, `annotationsOf`, `MCP_PROTOCOL_VERSION`; `detectAgent`, `AGENT_PROBES`; `definePlugin`, `Manifest`; and `ConfigError`, `resolve`, `explain`, `envName`, `screaming` re-exported from `seniority/precedence` | declare a program and run it; every projection is a function over the manifest |
| `burgee/commander` | `program`, `createCommand`, `createOption`, `createArgument`, `Command`, `Option`, `Argument`, `Help`, `CommanderError`, `InvalidArgumentError`, `InvalidOptionArgumentError`, `DualOptions`, `useColor`, `humanReadableArgName` | commander's API over burgee's engine — a façade, not a wrapper around commander |
| `burgee/yargs` | default factory, `YargsInstance`, `isYargsInstance`, `Parser`, `applyExtends`, `hideBin`, `argsert`, `parseCommand`, `objFilter`, `isPromise`, `camelCase`, `decamelize`, `looksLikeNumber`, `YError`, `platformShim` | yargs' API over the same engine |
| `burgee/yargs/helpers` | `applyExtends`, `hideBin`, `Parser` | the `yargs/helpers` drop-in specifier |
| `burgee/yargs/parser` | default `yargsParser`, `YargsParser`, `Parser`, `camelCase`, `decamelize`, `looksLikeNumber`, `tokenizeArgString` | the `yargs-parser` drop-in specifier |
| `burgee/completions` | `completionTree`, `renderCompletion`, `renderFigSpec`, `SHELLS`; `Shell` | static shell completions and a Fig spec, generated from a manifest |
| `burgee/testing` | `runBurgee`, `fakeRuntime`, `fakeClock`, `captureConsole`, `swapEnv`, `stripAnsi`, `codeOf`, `finish`, `RuntimeExit`, `processRuntime`, `ExitCode`, `isExitCode` | the in-process harness of T1 |
| `burgee/plugin` | `CONTRACT`, `definePlugin`, `validate`, `PluginError`; `Plugin`, `PluginErrorCode` | the plugin host, at the subpath the other seven hosts publish theirs at (added 2026-09-17). The four names the root barrel also carries are one module behind two doors, the way `applyExtends` is published at both `burgee/yargs` and `burgee/yargs/helpers`; `validate` and the `Plugin` interface are the half only this subpath carries, because they are the *host's* vocabulary rather than a program author's |
| `burgee/brand` | `defineBurgee`, `burgeeBody`, `burgeeFlagPath`, `chargeGroup`, `placeCharge`, `chargeTransform`, `chargeRotation`, `opposedField`, `fieldId`, `BURGEE_FLAG`, `BURGEE_ANGLE`, `CHARGE`, `FIELD_AXIS`, `DEFAULT_GROUND` | the burgee mark as SVG geometry — brand tooling, not CLI machinery |
| `burgee/contrast` | `ratio`, `mix`, `check`, `report`, `fieldColorAt`, `auditBurgee`, `AA`, `contrast`, `luminance` | the WCAG maths the brand audit runs on |
| `burgee/cli` | `program`, `brandCommand`, `devCommand` — **and `run(program)` at module load** | the `burgee` bin. Importing it executes the CLI; it is an executable, not a library entry |
| `burgee/schema.json` | a file, not a module: the family's plugin schema, copied into `dist/` by `schema-to-dist.mjs` | what a plugin author validates their object against. **Added to this table 2026-09-16** — the row was missing, and the export is a day old. It is not a schema for `--schema`'s output; see F1 |

Three of those rows will surprise a reader of the requirements: `burgee/brand` and
`burgee/contrast` are brand tooling that ships inside the framework package, and no
requirement above mentions either — and `burgee/schema.json` is a **plugin** schema on a
package whose F1 asks for a schema of something else entirely.

### How a consumer extends it

> **Superseded on 2026-09-16, one day after it was written.** `packages/burgee/src/plugin.ts`
> landed in #334 and #339 and closed every finding below: burgee now declares the family's
> `Plugin` shape with a `contract` key, a `validate()` that refuses, and the family's
> `PluginError` vocabulary with `code` and `fix`. The section is kept verbatim — a bar that is
> restated and then vanishes is indistinguishable from one that was quietly met — and what
> replaced it is recorded immediately after it, under *How a consumer extends it, as of
> 2026-09-16*.

**burgee's plugin is not the family's plugin, and this is the most important sentence in this
section.** Every other layer declares, structurally, an object shaped
`{ name, contract?, <its one key> }` — `roundel: tokens`, `flagstaff: tokens/glyphs/spinners/borders/components`,
`caique: widgets`, `closeout: handlers`, `bellpull: resolvers` — validated at `register()`
against a shared `schema.json` and refused with a shared `PluginError` vocabulary.
`packages/burgee/src/manifest.ts` declares a different thing under the same word:

```ts
interface Plugin {
  name: string;
  commands?: CommandNode[];
  hooks?: { preRun?: Hook; postRun?: Hook; onError?: Hook };
  enforce?: 'pre' | 'post';
}
```

No `contract`. No key any other layer reads, and no tolerance clause about keys it does not
read. There was no `packages/burgee/src/plugin.ts`, so burgee was not a host as far as
`scripts/plugin-error-vocabulary-lock.test.ts` was concerned — that lock derives its host list
from the presence of that file — and `PluginError` appeared nowhere in the package.

**Both halves of that paragraph are out of date, and the dates matter.** `src/plugin.ts`
exists since 2026-09-16: it carries `CONTRACT`, `Plugin`, `PluginError`, `PluginErrorCode`,
`validate` and a `definePlugin` that stamps and checks rather than returning its argument, and
`Manifest.use()` now runs a plugin's commands through the same `checkCommand` `defineCommand`
runs. What survived a day longer was the packaging: burgee hosted plugins and published no
`./plugin`, the only host in the family that did not, which is why
`scripts/plugin-contract-lock.test.ts` reached this package by relative path and recorded it
in `NO_PLUGIN_SUBPATH`. Published 2026-09-17, and the refusal's `fix` names the specifier —
it said "rebuild it with `definePlugin`" and never said where `definePlugin` was.

So: **a burgee plugin contributes commands and lifecycle hooks; a family plugin contributes
data to a layer. They are two extension points that share a noun.** Whether that is the
intended design or an accident is a decision this lane cannot make, and it is recorded below
as the finding it is.

**What a burgee plugin may contribute.**

| Field | Required | What it is |
| :-- | :-- | :-- |
| `name` | yes, by type | the attribution stamped onto every command the plugin contributes |
| `commands` | no | `CommandNode[]`, added to the manifest with `plugin: <name>` |
| `hooks` | no | `preRun`, `postRun`, `onError`, each `{ filter?: { command?: RegExp }, handler }` |
| `enforce` | no | `'pre'` or `'post'`, the Vite/Rolldown convention |

**What is validated: nothing.** `definePlugin(plugin)` is `return plugin;` — a types-only
identity helper. It is worth comparing with `defineCommand`, which does check reserved names
and calls `checkDefinition`. `Manifest.use()` pushes the plugin and adds its commands; it
performs no collision check, no duplicate-name check, and no shape check.

**What is refused: nothing.** There is no refusal path, no error code and no `fix` sentence
anywhere in burgee's plugin surface.

**What happens on a bad plugin**, read off `manifest.ts` rather than inferred:

- `use(undefined)` — the push succeeds, then reading `plugin.commands` throws a raw
  `TypeError`. Inside a run, `describeFailure` classifies that as `RUNTIME`; at program
  construction it is an uncaught throw.
- a plugin with no `name` — accepted. Its commands carry `plugin: undefined`, so M3
  attribution is silently lost.
- `enforce: 'mid'` — accepted. The comparator yields `NaN` and the hook order becomes
  undefined behaviour, with no error.
- a `handler` that is not a function — accepted at registration; the `TypeError` arrives at
  `fire()` time as a `RUNTIME` failure, one run later than the mistake.
- a malformed `CommandNode` — **never checked**. Plugin commands bypass `defineCommand`
  entirely, so `checkDefinition` (unknown type, duplicate short flag, duplicate kebab name,
  a numeric bound on a non-number) and the reserved-name guard never run on them. A plugin
  option named `json` overwrites the reserved boolean in the parse config, which breaks the
  O1 envelope without saying so.

**Ordering, precisely.** `enforce: 'pre'` first, then unordered, then `'post'`, with
registration order stable inside each bucket. That ordering is applied **only to hooks**.
Commands are added in `use()` call order, so `enforce` has no effect on which plugin wins a
path collision — and a collision resolves inconsistently: `find()` returns the first match
while `resolve()` lets the last registered node win a tie.

### How a consumer extends it, as of 2026-09-16

`packages/burgee/src/plugin.ts` exists. It is the host file the family's locks read, and every
finding above is closed:

| What the section above found | What `plugin.ts` does now |
| :-- | :-- |
| *"No `contract`"* | `Plugin.contract?: number`, checked against `CONTRACT = 1`. **Absent is a refusal**, not a default, because burgee's extension point is published — 0.6.1 is on npm and validated nothing — so an object with no `contract` was authored against a host that read none, and its silence reads *unknown* rather than *fine*. `definePlugin` stamps the number, so only a plugin built against an older burgee ever hits it |
| *"burgee is not a host as far as `plugin-error-vocabulary-lock.test.ts` is concerned"* | it is. `PluginError` with `code`, `message` and `fix`; codes `E_PLUGIN_SCHEMA` and `E_PLUGIN_CONTRACT` |
| *"What is validated: nothing"* | `validate(plugin, taken)` refuses a non-object, a missing or empty `name`, an unknown `enforce` (`'mid'` no longer yields a `NaN` comparator), an unknown hook stage, a hook with no `handler`, a non-array `commands`, a node with no `path`, and a contributed path already declared |
| *"a malformed `CommandNode` — never checked"* | `checkCommands` calls `checkCommand`, which is what `defineCommand` calls: the V5 reserved names and `checkDefinition`'s four. **A plugin option named `json` no longer replaces the envelope flag** in the parse config — it is refused at the door, and that is the defect the first case in `plugin.test.ts` is named for |
| *"`use(undefined)` — the push succeeds, then … a raw `TypeError`"* | `Manifest.use()` validates **before** it pushes, so a refused plugin contributes no command and leaves no half-registration |
| *"a collision resolves inconsistently: `find()` … `resolve()` …"* | a contributed path that is already declared is refused with that sentence as its `fix`. Which of `find()` and `resolve()` is right for a **first-party** duplicate is still open — it is a decision about every program, not about plugins |

What is unchanged: a burgee plugin contributes `commands` and `hooks` where a family plugin
contributes data to a layer, and `plugin.ts` **ignores every other key without complaining**,
which is what lets one object register against any subset of the family that is installed.

### What burgee does not do, and why

Beyond "Out of scope" below, four refusals a consumer should know before looking:

- **It does not parse argv itself in the sense of owning semantics.** The engine is the
  manifest; the façades are the syntax. Argv parsing semantics are explicitly out of scope.
- **It has no `AUTH` exit code and no author-facing error classification.** `ExitCode` is
  `OK`, `RUNTIME`, `USAGE`, `CONFIG`, `CANCELLED`, `SIGINT`, and `describeFailure` maps by
  `instanceof` over a fixed set. E6 and E7 ask for more than the code gives.
- **It does not colour its own help.** The engine never reads `NO_COLOR` or `FORCE_COLOR`;
  only the commander façade does, and `renderHelp` defaults colour off.
- ~~**It carries no plugin error vocabulary.** See above: the family's `PluginError` is the
  output stack's, and burgee's extension point is outside it.~~ **No longer true as of
  2026-09-16**: `src/plugin.ts` declares `PluginError` with `code`, `message` and `fix`, and
  `E_PLUGIN_SCHEMA` / `E_PLUGIN_CONTRACT` are the family's codes. Struck rather than deleted,
  for the reason the section above it gives.

## What is built, requirement by requirement (2026-09-16)

Every requirement this design states, with the status the tree supports. It is the first
reading of the whole list: the section below it, *Where this document and the code
disagree*, was written on 2026-09-15 against a subset, and four of its entries have since
closed. **Where the two disagree, this table is the later reading**; the older one is kept
whole, because a bar that is restated and then vanishes is indistinguishable from one that
was quietly met.

**The count.** 114 requirements, in seventeen families — `Z F O E V S P D T H M K J C B N U`.
The prose above says *92* and *"Ninety-two requirements"*; both are wrong, and wrong the same
way, because `E6 E7 V8 N11–N15` were added after the arithmetic was last done and `C1–C8`
names two rows that do not exist. **Built: 93. Not built: 21**, and the count moves as rows are
built rather than as the prose is rewritten — T1 moved on 2026-09-22 and the tally moved with
it. An audit whose total disagrees with its own rows is the failure this paragraph is a record
of; `spec-tally-lock.test.ts` now derives the two numbers from the tables instead of trusting
this sentence.

**How a row was decided.** From `packages/burgee/src/` and the repository around it, never
from this document's prose about itself. `Not built` is the answer whenever the behaviour the
requirement *states* is not true of the tree — including when a good half of it is, in which
case the evidence says which half. A row whose `Holds` column reads `L` or `R + L` is judged
on the behaviour, not the enforcement: `eslint-plugin-cli-floor` is still an intent directory
and not a package (`packages/` holds ten directories and none of them is it), so every `L` is
unimplemented, and a requirement whose *stated behaviour is the lint rule* — F3, O3, P1 — is
`Not built` for that reason alone.

**This table is not yet readable by the roadmap checker, and that is a defect in the checker
rather than in the ids.** `scripts/plan-progress.ts`'s `designGap()` collects requirements
with `/^- \*\*(R\d+)/` and statuses with `/^\| (R\d+) \| \*\*Built\*\*/`. burgee's ids are
`N6`, `J3`, `U5` — never `R<n>` — so the largest design in the repository reports
`the design lists no requirements`, exactly as an empty one would. Widening both patterns to
`[A-Z]+\d+` is an integrator change (`scripts/**` is not this lane's), and until it lands this
section is read by people and not by `npx tsx scripts/plan-progress.ts`.

### The shape lock

| # | Status | Evidence | The check |
| :-- | :-- | :-- | :-- |
| Z1 | **Built** | `src/shape.test.ts` installs the packed tarball into a temp dir, writes one `.mjs`, runs it | `shape.test.ts`: *"the user authored exactly one file, and never ran a build"* |
| Z2 | **Built** | every capability is its own `exports` subpath, and the core entry is proven not to reach `dev.js`, `testing.js` or the output stack | `src/weight.test.ts`, the `denied` list per entry |
| Z3 | **Built** | burgee depends on `bellpull`, `closeout`, `linegauge`, `roundel` and `seniority` — all in-family — and on nothing else, as a dependency, peer or optional dependency. The requirement said *zero*; the owner restated it to *in-family only* (D-111), which is what the family was designed to be | `scripts/package-shape-lock.test.ts`: *"installs nothing from outside this repository — dependencies, peers or optional (D-111)"* |
| Z4 | **Built** | the README's first example is 9 lines and installs nothing but `burgee` | none. `Holds` says `lock`; no test pins the 15-line ceiling |
| Z5 | **Built** | `defineProgram` builds the `Manifest` in memory at call time, and there is no precompute path at all, so it can never be a prerequisite | none for the bench half: `examples/demo-cli-large` is 30 commands, not the 250 of yargs #1005 |

### Discoverability

| # | Status | Evidence | The check |
| :-- | :-- | :-- | :-- |
| F1 | Not built | `schema.ts` prints the tree and stamps `schemaVersion: 1`. The *validating* half is absent: the only `schema.json` burgee publishes is the **family plugin schema** — byte-identical across six packages and titled `flagstaff plugin` — not a schema for `--schema` output, and nothing validates the document against anything | `schema.test.ts` asserts the shape; no test validates against a JSON Schema |
| F2 | **Built** | `--help --json` prints the help *document*: `{ schemaVersion, name, arguments, options, examples, inputSchema, commands }`, which is `commandSchemaOf` for the node plus its immediate children — the same shape `--schema` publishes, scoped to one command, so there is one document shape in the package rather than a second one invented for help. This row read `Not built` until 2026-09-22 and was stale, not wrong when written: `dispatch` and `unresolved` both grew the branch afterwards and nothing moved the audit | `help-json.test.ts`, and the three call sites carry `// F2 — help as data` in `execute.ts` |
| F3 | Not built | **The lint half lives in the Interlace ESLint monorepo (D-124).** held by `L` only; `eslint-plugin-cli-floor` is not a package | — |
| F4 | **Built** | `help.ts`'s `commandSections` groups children by `group`; `hidden` is filtered by `runnable()`; `commandSchemaOf` carries `group` into `--schema` | `help.test.ts`, `schema.test.ts` |

### Output

| # | Status | Evidence | The check |
| :-- | :-- | :-- | :-- |
| O1 | **Built** | `emit()` writes `{ ok: true, data, meta }`; `report()` writes `{ ok: false, error: { code, message, hint } }` | `machine-json.test.ts`, `shape.test.ts` |
| O2 | **Built** | `execute.ts`'s `lookOf` is the one decision every help path takes: `FORCE_COLOR` decides when set (`0`/`false` off, anything else on, over a pipe and over `NO_COLOR`, as Node's `getColorDepth` does); otherwise colour needs an interactive terminal — a detected agent is not one (N12) — no non-empty `NO_COLOR`, and `TERM` not `dumb`. Spinners, redraws and prompts are not the engine's to draw; the row holds for what it draws | `color.test.ts`: *"FORCE_COLOR overrides a pipe and NO_COLOR, and FORCE_COLOR=0 overrides a terminal"* — three of its four cases red on the engine before `lookOf` |
| O3 | Not built | **The lint half lives in the Interlace ESLint monorepo (D-124).** held by `L` only | — |
| O4 | **Built** | `help.ts` imports `styleText` from `node:util`; no colour package anywhere in the family | `scripts/layer-boundaries-lock.test.ts`: *"holds zero external runtime dependencies across the family"* |
| O5 | **Built** 2026-09-16 | `shutdown.ts` registers `flushStreams` in closeout's `flush` phase over `[host.stdout, host.stderr]`, which runs before `release` and before `restore`; every `io.exit` in `execute.ts` goes through `leave()` | `shutdown.test.ts`, and `pty-signal.test.ts` on the signal path. Caveat: `detachedTeardown()` is built with **no** streams, so an injected `stdout` is still never drained — it is a synchronous `{ write }` with nothing buffered |

### Errors and lifecycle

| # | Status | Evidence | The check |
| :-- | :-- | :-- | :-- |
| E1 | **Built** | `exit-code.ts` declares exactly six codes and `isExitCode` | `scripts/exit-code-lock.test.ts`: no bare literal at an exit site outside the two front-ends |
| E2 | **Built** | `describeFailure` classifies before rendering; `textFailure` prints `error: <message>` and a `hint:` line, never help and never a stack | `parsing-edges.test.ts`, `shape.test.ts` |
| E3 | **Built** | `Failure` carries `fix` beside `hint`, `textFailure` renders `fix: …` and the `--json` envelope carries it as `error.fix`. The producer is `unknownOption`, which sets it to the near match it found and **omits it rather than guessing** when there is none — an executed guess burns the turn the field exists to save. `AuthError` takes one from the author. This row read `Not built` until 2026-09-22 and was stale: the field, both renderers and the first producer had all landed | `auth-exit.test.ts` asserts `fix:` on stderr and `error.fix` in the envelope; `unknown-option.test.ts` for the near-match half |
| E4 | **Built** | `dispatch()` is the order, in one function: parse → resolve layers → relations → coerce → `await node.run` → `emit` → `leave` | `option-relations.test.ts`, `env.test.ts` |
| E5 | **Built** 2026-09-16 | `shutdown.ts` binds closeout's `install()` — `exit`, `beforeExit`, five signals, `uncaughtException`, `unhandledRejection` — and hands the terminal back last | `pty-signal.test.ts`, in a **real** pty: *"dies of the signal rather than exiting"*, `WIFSIGNALED` with signal 2 |
| E6 | **Built** 2026-09-22 | `ExitCode.AUTH` is **5**, and `AuthError(message, hint?, fix?)` in `validate.ts` is how a handler reaches it. `describeFailure` maps it above `ConfigError`, because a missing credential is not a broken config file — `CONFIG` says fix the runner and `AUTH` says get a credential, which are different actions. 5 rather than `gh`'s 4 because 4 is `CANCELLED` here and moving a published code is breaking for every consumer that branches on it | `auth-exit.test.ts`: `AUTH` and `RUNTIME` differ on two commands of the same program, both renderings carry `hint` and `fix`, and no two names share a code. `scripts/exit-code-lock.test.ts` holds the contract at seven |
| E7 | Not built | **The mapping half is declarative since 2026-09-22**: `CLASSIFIED` in `execute.ts` is a table of error class → `ExitCode`, and `describeFailure` finds in it rather than running a chain of `instanceof` — so adding a class is a row, and the list is the precedence if one ever extends another. Two halves are still absent: nothing lets an **author** declare a class of their own, and there is no startup check that refuses a reused code. The reuse half has a *build-time* lock — `exit-code.test.ts` asserts no two names share a number and `scripts/exit-code-lock.test.ts` holds the contract at seven across every package — which is the property, caught earlier than a startup check would catch it, but not the mechanism the requirement describes | `exit-code.test.ts`, `scripts/exit-code-lock.test.ts`, `auth-exit.test.ts` |

### Values and precedence

| # | Status | Evidence | The check |
| :-- | :-- | :-- | :-- |
| V1 | **Built** | `resolveValues` builds `Layers` and calls `seniority/precedence`'s `resolve`; per command, never global | `env.test.ts`: *"env never leaks into a command that does not declare the option"* |
| V2 | **Built** | `OptionSpec.env` and `Manifest.envPrefix`; help renders `[env: NAME]` inline and an `Environment:` section; `--schema` publishes `options` verbatim, `env` included | `env.test.ts`, `help.test.ts` |
| V3 | **Built** | `--explain <option>` through seniority's `explain()`, and `meta.provenance` on every `--json` envelope | `env.test.ts`: *"--explain prints the winner and the candidates it beat, and runs nothing"* |
| V4 | **Built** | `pkg.ts`'s `nearestPackage` walks up from the entry file; `versionOf` prefers the declared version and falls back to it | `version-flag.test.ts`, `env.test.ts` |
| V5 | **Built** | `definition.ts`'s `RESERVED` refuses `json help schema mcp version explain`, at `defineCommand` **and** at `Manifest.use()`. The `Holds` column says `L`; it is held by `R`. Restated below | `env.test.ts`: *"reserves version and explain like the other surfaces"*; `plugin.test.ts` |
| V6 | **Built** | `seniority/config`'s `discover` with the fixed order, loaded lazily for a program that opted in; the chain is reported through `--explain` | `env.test.ts`; seniority's `discovery.test.ts` |
| V7 | **Built** | `seniority/src/config.ts`'s `loadWithExtends` — deep merge, outermost first, cycle rejection, resolution from the extending file | seniority's `config.test.ts` |
| V8 | Not built | there is no `config explain` command and no generated precedence table. `--explain <option>` exists and is a different surface | — |

### Validation

| # | Status | Evidence | The check |
| :-- | :-- | :-- | :-- |
| S1 | **Built** | `OptionSpec.schema` accepts any `StandardSchemaV1`; `InferOptions` derives the handler's type from the same declaration | `schema-dsl.test.ts` |
| S2 | **Built** | `Relation` carries `exactlyOneOf`, `atLeastOneOf`, `atMostOneOf`, `conflicts` and a value-aware `implies`; `dependsOn`/`exclusive` compile into it through `optionRelations` | `option-relations.test.ts`, `relations-schema.test.ts` |
| S3 | **Built** | `toNumber` refuses `NaN` and `Infinity`; `checkDefinition` refuses an unknown `type` at definition time | `schema-dsl.test.ts` |
| S4 | **Built** | `ArgumentSpec.type: 'file'` (D-113): a `-` there hands the handler the injected stdin as `ctx.stdin`, and the positional still reads `-`. A variadic file argument covers every position it takes; `-` for two file arguments is a usage error, because stdin can be read once; `-` on any other argument is just a string. The `--` half was already built: `splitPositionals` hands everything after the terminator to the handler as `passthrough` | `stdin-dash.test.ts`, `parsing-edges.test.ts` |
| S5 | **Built** | `names.ts` — one canonical camelCase key, kebab derived; `checkDefinition` refuses two keys that meet on the command line | `schema-dsl.test.ts` |
| S6 | **Built** | `dispatch()` calls `checkRelations` before `coerce`, and `coerce` checks choices before the Standard Schema | `option-relations.test.ts` |
| S7 | **Built** | `toParseConfig` maps `boolean` to parseArgs' `type: 'boolean'`, which never consumes a value | `negation.test.ts`, `parsing-edges.test.ts` |
| S8 | **Built** | `splitMultiple` with `separator` defaulting to `,`; repetition accumulates | `schema-dsl.test.ts` |

### Prompts

| # | Status | Evidence | The check |
| :-- | :-- | :-- | :-- |
| P1 | Not built | **The lint half lives in the Interlace ESLint monorepo (D-124).** held by `L` only | — |
| P2 | Not built | the requirement specifies exit **2**. The nearest mechanism, `ctx.actionRequired`, unwinds to `ExitCode.CANCELLED` (**4**), and there is no prompt-to-`USAGE` path in the package | — |
| P3 | Not built | `caique/src/binding.ts` classifies a cancelled prompt as the string `'CANCELLED'` and never `RUNTIME`, which is the taxonomy half. Nothing *exits* 4: caique declares no numeric code, and burgee does not import caique, so no path joins the two | — |

### Deprecation and completions

| # | Status | Evidence | The check |
| :-- | :-- | :-- | :-- |
| D1 | **Built** | `definition.ts`'s `checkDeprecated` refuses `deprecated: true` and `''` on a command and on every option, at the one door `defineCommand` and `Manifest.use()` share, with the fix in the message. A named replacement already reached all three surfaces — help's `(deprecated: use X)`, `--schema`'s `deprecated`, the warning's `, use 'X'` — so requiring it is what was missing. The façades do not pass that door: commander and yargs accept the bare form and their graded suites expect it | `deprecation.test.ts`: *"refuses a command deprecated with no replacement"* — three of its five cases red before the refusal |
| D2 | **Built** | `completions.ts` walks the manifest into bash, zsh, fish and PowerShell scripts, statically | `completions.test.ts`, `src/__snapshots__` |
| D3 | Not built | the half that matters is built — no generated script runs Node on TAB. The escape hatch is not: there is no `dynamic` marker on an option anywhere in `OptionSpec` | `completions.test.ts` |
| D4 | **Built** | snapshots in `src/__snapshots__`, and each of the four shells runs its own script | `.github/workflows/completions.yml` — bash through `COMP_WORDS`, zsh through a real TAB in a pty, fish through `complete -C`, pwsh through `TabExpansion2` |
| D5 | **Built** | `renderFigSpec`, from the same walk as the shell scripts | `fig-spec.test.ts`, `fig-schema.test.ts` (keys pinned against `@withfig/autocomplete-types`) |

### Testing

| # | Status | Evidence | The check |
| :-- | :-- | :-- | :-- |
| T1 | **Built** | `runBurgee` forwards `cwd`, `stdin` and per-stream TTY-ness to `execute` alongside argv, env, the two streams and `exit`. It did not until 2026-09-22: `fakeRuntime` computed all three and six of the nine fields were passed on, so `tty: true` got the non-interactive floor and a `cwd` pointed at a fixture tree had config discovery read the repository the test was running in | `testing-harness-forward.test.ts` — two cases, both proved to fail on the six-field version. `interactive` reads `[true, false]` for `tty: true`/`false`, and a `<name>.config.json` under the given `cwd` reaches the handler |

### Help

| # | Status | Evidence | The check |
| :-- | :-- | :-- | :-- |
| H1 | **Built** | `renderHelp(manifest, node, opts)` reads the manifest and nothing else; no host help class is reachable from it | `help-snapshot.test.ts` |
| H2 | **Built** | `exampleLines` puts `$ command` on one line and indents the description below it; never two columns | `help.test.ts`, `help-snapshot.test.ts` |
| H3 | **Built** | `ioOf` sets `width: out.columns ?? HELP_WIDTH`, and `HELP_WIDTH` is 100 | `help-width.test.ts` |
| H4 | **Built** | `renderHelp` emits `Options:` then `Global options:`, in that order, always | `help-snapshot.test.ts` |
| H5 | **Built** | `annotate` appends `[env: NAME]` and `deprecation()` inline, on the option's own row | `help.test.ts` |
| H6 | **Built** | `verbose` defaults false; `[string]` hints appear only when asked for | `help.test.ts` |

### Modularity

| # | Status | Evidence | The check |
| :-- | :-- | :-- | :-- |
| M1 | **Built** | Restated by D-112: a group is available, not mandatory. `CommandNode.group` carries it, `help.ts`'s `commandSections` renders children under their group and the rest under `Commands:`, and `commandSchemaOf` publishes it in `--schema` | `help-snapshot.test.ts`: *"a group: grouped children, a deprecated one, a hidden one omitted"* |
| M2 | **Built** | `lazyRun` imports the module on the first call; `Manifest.add` wraps a `load`-only node | `examples/conformance/src/modularity.test.ts`: *"serves `--help` and `--schema` without importing a single lazy handler"* |
| M3 | **Built** | `Manifest.use()` stamps `plugin: <name>` on every contributed node; `commandSchemaOf` publishes it | `plugin.test.ts`, `adoption-ladder.test.ts` |
| M4 | **Built** | `sharedOptions(name, specs)` tags every copy `sharedFrom`, and the schema carries it | `schema-dsl.test.ts` |
| M5 | **Built** | D1's refusal covers it: a command declared through burgee cannot be deprecated without naming its replacement, so `warnDeprecated` always has one to write. A façade command deprecated the incumbent's way still warns bare, as the incumbent does | `deprecation.test.ts` |
| M6 | **Built** | `resolveCommand` and `runCommand` are exported from `index.ts` | `shape.test.ts`'s export-map lock |

### Packaging

| # | Status | Evidence | The check |
| :-- | :-- | :-- | :-- |
| K1 | **Built** | All nine published packages: bellpull, closeout, linegauge, paratext, roundel and seniority depend on nothing; burgee, caique and flagstaff only on siblings. Held across `dependencies`, `peerDependencies` and `optionalDependencies` — the lock checked the first alone until 2026-09-23 | `scripts/package-shape-lock.test.ts`: *"installs nothing from outside this repository — dependencies, peers or optional (D-111)"*, proved red with an external peer on roundel |
| K2 | **Built** | every entry publishes `default` beside `import`; no top-level await | `shape.test.ts`: *"consumable from CommonJS too — the same ESM file, through `require(esm)`"* |
| K3 | **Built** | `util.styleText` for colour, `node:readline` for MCP, `node:util`'s `parseArgs` for argv. Nothing outside the repo is reachable at run time, so there is no package a native could have replaced. The named `L` rule does not exist | `scripts/package-shape-lock.test.ts`: *"imports none of the packages Node ships natively"* |
| K4 | **Built** | `release.yml` runs `npm run check:artifacts` on the built `dist/` before the publish job, and publishes with `--provenance` under `id-token: write` | `scripts/deploy-lock.test.ts`, `scripts/check-published-artifacts.ts` |
| K5 | **Built** | `.sdlc/bands/artifact-size-baseline.json`, packed and unpacked, with a 10% allowance | `scripts/artifact-size-ratchet-lock.test.ts` |
| K6 | **Built** | one `EntryRule` per `exports` key, each with its own `allow`/`budget`/`denied`; config discovery, the completion templates and the dev loop are all reached by dynamic `import()` and paid for only on use | `src/weight.test.ts`: an entry point cannot be added without declaring a budget |

### The adoption ladder

| # | Status | Evidence | The check |
| :-- | :-- | :-- | :-- |
| J1 | **Built** | measured 2026-09-16: commander **1360 / 1360**, yargs **804 / 804**, every row `▲ 0` | `npm run compat` |
| J2 | **Built** | `commander/command.ts` serves `--schema`, `--mcp` and the `--json` envelope from the projected manifest; `yargs/burgee.ts` projects the same snapshot | `adoption-ladder.test.ts`: *"a commander program gets `--schema` and MCP tools from its projected manifest"* |
| J3 | Not built | there is no single explicit call that turns on behaviour-changing guarantees. The additive half is on by default, and the behavioural floor is not one line away — it is not reachable at all from a façade program | — |
| J4 | Not built | *"the program wins"* is built and tested: `--schema` and `--mcp` are withheld when any command in the chain declares the flag, and `--json` likewise. *"reported by `--schema`"* is not — no type in `schema.ts` carries a withheld-surface field | `adoption-ladder.test.ts`: *"leaves a program that declares its own `--schema` option alone"* |
| J5 | **Built** | `projectManifest` preserves plugin-contributed nodes across re-projection, and façade and native commands land in one `Manifest` | `adoption-ladder.test.ts`: *"puts commander-syntax and plugin commands in one manifest"* |
| J6 | **Built** | the strict path is graded by the host's own vendored suite (C2); the enhanced path by `examples/conformance`, a separate suite with its own parity, MCP, harness and modularity files | `npm run compat`, and `examples/conformance` under `npm test` |
| J7 | **Built** | `Manifest` does not record which façade filled it, and `plugin.ts` validates the same object whichever did | `adoption-ladder.test.ts`: *"accepts a plugin and records what it contributed"*, on a commander-syntax program |
| J8 | **Built** | `Manifest.fire()` is called from `dispatch()`, which every rung reaches | `adoption-ladder.test.ts`: *"fires the plugin hook on a command declared in commander syntax"* |
| J9 | **Built** | `./commander` and `./yargs` declare `allow: []` — no bare import at all, commander and yargs included. The real packages exist only under `packages/compat-oracle/vendor/` | `src/weight.test.ts`, `src/front-end-boundary-lock.test.ts` |

### Compatibility

| # | Status | Evidence | The check |
| :-- | :-- | :-- | :-- |
| C1 | Not built | `hosts.ts` pins **one** version per host (commander 15.0.0, yargs 18.1.0) and grades that. No package declares a supported host range, and no job runs a host's suite at a second major | — |
| C2 | **Built** | graded through a one-line shim and published per release | `npm run compat`; `scripts/compat-page.ts --check` |
| C3 | **Built** | `compat.yml`'s `matrix` job runs Linux, macOS and Windows × Node **24 and 26** — every even major `engines: >=24` admits. 26 was narrowed out on 2026-09-08 to halve CI while the output stack landed (#64) and came back on 2026-09-23, after the whole suite passed on v26.10.0: 767 root tests and every package's. It is graded a month before its LTS promotion, not first as one | `.github/workflows/compat.yml` `matrix.node`; `npm test` on Node 26.10.0 |
| C4 | **Built** | `packages/compat-oracle/baseline/*.json`, twenty-one files; an `Exclusion` needs a `why`, and the oracle refuses one that matches nothing | `npm run compat`, and compat-oracle's own suite |
| C5 | **Built** | the `▲` column is the ratchet; lowering a rate needs a baseline edit | `npm run compat`; `.github/workflows/compat.yml` opens an issue when main goes red |
| C6 | **Built** | `vendor/<host>/.source.json` records the upstream commit; `compat-upstream.yml` opens one issue per (host, version) and `compat-refresh.yml` opens the PR | `.github/workflows/compat-upstream.yml` |

### Benchmarks

| # | Status | Evidence | The check |
| :-- | :-- | :-- | :-- |
| B1 | Not built | the axis and its stub-driven harness exist and have never run: without `CLAUDE_CODE_OAUTH_TOKEN` it reports `skipped`, and both its bands read `unmeasured`, never a number. The requirement is a measurement, and the measurement has not happened | `benchmarks/agent.test.ts` drives the harness against a stub `claude`; `emit.test.ts` proves an unmeasured axis cannot read as measured |
| B2 | **Built** | `axes/perf.ts`, `ROUNDS = 42` interleaved spawns, with `fixtures/cold-start/node.mjs` as the bare-node floor row | `benchmarks/perf.test.ts` |
| B3 | **Built** | `axes/compat.ts` reads the oracle's output; `--no-oracle` reads the last results rather than recomputing | `benchmarks/bands.test.ts` |
| B4 | **Built** | `axes/weight.ts` measures bundled and installed bytes per entry point against the package it replaces, with the resolved version written into every record. The measurement is built; **three of its gates are red as of 2026-09-16** — see below | `npm run bench -- --axis weight --check` |
| B5 | **Built** | one `BenchRecord` shape, `results.schema.json`, one collector in `emit.ts` | `benchmarks/emit.test.ts`, `benchmarks/bands.test.ts` |
| B6 | **Built** | `bench.yml` runs perf, compat, weight and reliability on every PR, and the agent axis on `cron: "40 5 * * 2"` | `benchmarks/ci-axes.test.ts` |
| B7 | **Built** | every generated README section is derived from a measured record and refuses a hand-edited number | `scripts/readme-benchmarks-lock.test.ts`, `scripts/generated-page-gate-lock.test.ts` |

### Agent interface

| # | Status | Evidence | The check |
| :-- | :-- | :-- | :-- |
| N1 | **Built** | `mcp.ts` — newline-delimited JSON-RPC 2.0 over `node:readline`; `initialize`, `ping`, `tools/list`, `tools/call`; definitions from `toolsOf(manifest)` | `mcp.test.ts` |
| N2 | **Built** | `toolsOf` serves only a command that declared `effects`, so absence is exclusion | `mcp.test.ts`, `adoption-ladder.test.ts` |
| N3 | **Built** | `node:readline` and nothing else; no SDK | `src/weight.test.ts` — the `.` entry admits no MCP dependency |
| N4 | **Built** | `callTool` runs `argvOf(…)` with `--json` appended, so a tool result is the same envelope a `--json` caller gets | `mcp.test.ts` |
| N5 | **Built** | the `invoke` closure injects `stdout`/`stderr` as `{ write }` and its own `exit`, so `ioOf` reports `tty: false`; the engine never colours; failures come back as the E3 body | `mcp.test.ts` |
| N6 | **Built** | `checkEffects` throws at definition time: *"command X is runnable and declares no effects; declare read_only, idempotent, non_idempotent — or withheld, which serves it to people and keeps it out of the MCP tool list"*. Declining is a thing said rather than a thing forgotten, which is the whole point — *I decided agents should not have this* and *I forgot* were the same value before. Stale row: this landed with the 938-byte change recorded in `weight.test.ts` | `definition.test.ts`, and every fixture in the package has had to declare `effects` since |
| N7 | **Built** | `changedOf` throws when a command declaring `effects: 'idempotent'` returns no boolean `changed`, and `emit` carries it in `meta` | `machine-json.test.ts` |
| N8 | **Built** | `surface()` answers `--schema` before any command resolves, before config and before any handler; `schema.ts` reads the manifest only | `schema.test.ts`, `shape.test.ts` |
| N9 | **Built** | `optionProperty` publishes `enum`, `minimum` and `maximum` — and `flag`, `dependsOn`, `exclusive` — as data | `schema.test.ts`, `relations-schema.test.ts` |
| N10 | Not built | clispec.dev and cli-agent-lint are named once, in `.sdlc/research/agent-requirements.md`. There is no axis, no CI job and no published result for either | — |
| N11 | **Built** | `ctx.actionRequired(spec)` unwinds through `ActionRequired`; `runnableNext` prefixes the program name and carries the caller's own `--json` into each `next[]` command | `machine-json.test.ts` |
| N12 | **Built** | `agent.ts` — `AGENT_PROBES`, `FORCE_TTY=1`, and `interactive = forced \|\| (tty && agent === undefined)`, which is the load-bearing clause. The probe list is **5** variables, not the 13 the requirement names; restated below | `agent.test.ts` |
| N13 | **Built** | the budget half: `Manifest.schemaBudget`, `SCHEMA_BUDGET = 48_000`, `summaryOf`. The drilling half: by command path (`--schema <command>`), and below it by field path (D-116) — `--schema <command> --field options.region` returns that one value, a step that does not exist is refused with the steps that do, and the walk lives in `schema-surface.js`, loaded only when `--field` is typed | `schema.test.ts`, `schema-field.test.ts` |
| N14 | Not built | `--json` is seeded in `toParseConfig` as `{ type: 'boolean' }`. It takes no argument, so nothing lists valid fields and nothing rejects an invalid one | — |
| N15 | Not built | **Deferred past 1.0 (D-115)** — not a 1.0 gate. there is no non-JSON `agent` format. The only format flag in the package is `--format=json-pretty`, and it makes the output *larger* | `machine-json.test.ts` |

### The output stack

| # | Status | Evidence | The check |
| :-- | :-- | :-- | :-- |
| U1 | **Built** | Restated by D-130 to the arrows the manifests hold. One package per layer, and every arrow points up the family or into the foundation — nothing reaches past a sibling, and nothing leaves the repository (D-111) | `scripts/package-shape-lock.test.ts`: *"has no external runtime dependencies, and same-repo ones only point up the family"*; `scripts/layer-boundaries-lock.test.ts` |
| U2 | **Built** | `roundel/src/policy.ts` — `OutputMode` is `'tty' \| 'pipe' \| 'json' \| 'accessible' \| 'ci'`, read from a `Runtime`; no component detects the terminal itself | roundel's `policy.test.ts` |
| U3 | **Built** | `flagstaff/src/plugin.ts` refuses a spinner or component without a `static` projection, at `register()` | `scripts/plugin-contract-lock.test.ts` |
| U4 | **Built** | the shared `schema.json` — plugins are data, `static` required and `frame` the one optional function | `scripts/plugin-schema-lock.test.ts` |
| U5 | Not built | **measured 2026-09-16**, and the ceiling is the *lightest incumbent*, which three burgee entry points now exceed: `burgee/yargs ÷ yargs` **1.033** (gate ≤ 1), `burgee/commander ÷ commander` **1.631** (gate ≤ 1.6), `burgee ÷ cac` **5.44** (gate ≤ 3.9). The family's other subpaths hold — chalk 0.574, picocolors 0.162, ora 0.93, boxen 0.347, log-update 0.498 | `npm run bench -- --axis weight --check` |
| U6 | **Built** | no package in the family declares a dependency outside this repository | `scripts/layer-boundaries-lock.test.ts`: *"holds zero external runtime dependencies across the family"* |
| U7 | **Built** | all nine packages have a `src/shape.test.ts`; `caique` and `bellpull`, the two without one, each install their packed tarball into an empty project, run one authored `.mjs` with no build step, `require()` the same entries from CommonJS, and assert the installed dependency set — bellpull none, caique `closeout` and `linegauge`. Each went red when one published subpath was deleted from its `exports`. The K5 half holds for every package | `ls packages/*/src/shape.test.ts`; `.sdlc/bands/artifact-size-baseline.json` |
| U8 | **Built** | flagstaff publishes `ora`, `boxen`, `cli-table3`, `log-update` and `loop` — a box, columns and a status line, and no layout engine | none. The `exports` map is the evidence; nothing asserts the ceiling |
| U9 | Not built | the design itself states the condition — *"locks when the weekly one-turn authoring eval reaches the pass rate it states"* — and that eval has not run. The schema and `llms.txt` halves exist | — |
| U10 | **Built** | Restated by D-130. All nine packages declare `sideEffects` truthfully — each `bin`, plus paratext's two modules that register built-ins at load — and a root named import bundles to its subpath's bytes: 32 pairs, equal to the byte | `scripts/side-effects-lock.test.ts`; `scripts/tree-shake-fixture.test.ts` |
| U11 | **Built** | twenty-one incumbents graded by their own suites with the rate published and ratcheting, zeroes included and labelled (`clack 0 / 606`, `lilconfig 0 / 77`, `rc` *target not built yet*) | `npm run compat`; `scripts/compat-page.test.ts` |
| U12 | Not built | the design states the condition — *"locks when the independence install test passes for every layer and the first adopter installs a layer alone"* — and neither has happened | — |
| U13 | Not built | `src/index.ts` statically re-exports from `seniority/precedence`, `src/execute.ts` imports it statically, `src/help.ts` imports `linegauge` and `src/shutdown.ts` imports `closeout`; the build is `tsc`, so those specifiers survive into `dist`. The **output-stack** half of the claim does hold and is locked: `roundel`, `flagstaff` and `caique` are denied by name from the `.` entry | `src/weight.test.ts`, the `.` rule's `denied` list |

### Requirements restated

Seven requirements, in six rows, are wrong as written rather than unbuilt. The old wording is kept here
verbatim, because a bar that is restated and then vanishes is indistinguishable from one that
was quietly met. **None of these is a decision to lower a bar** — each records what the tree
holds instead, and the row above stays as it is until someone decides.

| # | As written | What is true instead |
| :-- | :-- | :-- |
| Z3 / K1 | *"Zero runtime dependencies (K1). oclif ships 18"* · *"Zero runtime dependencies in every layer package; hosts and UI libraries are peers"* | **No runtime dependency outside this repository.** burgee declares `closeout`, `linegauge`, `roundel`, `seniority`; flagstaff declares four; caique one. That is the U6 shape, and it is what `package-shape-lock.test.ts` and `shape.test.ts` actually assert. The comparison with oclif's 18 survives — none of ours is a third party — but *zero* is not the number, and has not been since the foundation packages landed |
| V5 | `Holds: L (no-reserved-option-names)` | Held by **R**. `definition.ts`'s `RESERVED` refuses `json help schema mcp version explain` at `defineCommand` and at `Manifest.use()`, and throws rather than warns. The lint rule would be a second, earlier reading of the same rule, not the thing that holds it |
| U1 | *"`burgee` → ∅, `roundel` → ∅, `flagstaff` → `roundel`, `caique` → `roundel`, `flagstaff`"* | `burgee → closeout, linegauge, roundel, seniority` · `roundel → ∅` · `flagstaff → closeout, linegauge, paratext, roundel` · `caique → closeout`. The *direction* rule holds and is locked; the enumeration was written before `closeout`, `linegauge`, `paratext` and `seniority` existed |
| U10 | *"`sideEffects: false`"* | `sideEffects: ["./dist/cli.js"]` for burgee, because `burgee/cli` **is** an executable and runs `run(program)` at module load. Declaring it `false` would be a false statement a bundler acts on. What the requirement wants is "no incidental side effects", which is what the array says precisely — and what the six packages declaring nothing at all do not say |
| N12 | *"`AI_AGENT` and the 13 vendor variables"* | `AGENT_PROBES` carries **five**: `AI_AGENT`, `CLAUDECODE`, `CURSOR_AGENT`, `CODEX_THREAD_ID`, `GEMINI_CLI`. The mechanism is complete and the list is data, so the gap is eight entries rather than a design change |
| Z4 | `Holds: lock` | There is no lock. The example is 9 lines today and nothing would notice if it became 40 |

### What this reading found that the tree contradicts

Three things are stated in public and are not true of the tree. None is edited here — a
published claim is PLAN step 2.1's, and that step stops and asks.

1. **`packages/burgee/README.md:65` and the root `README.md:104`** both draw
   `--schema    versioned, JSON-Schema validated`. The *versioned* half is true
   (`schemaVersion: 1`). **JSON-Schema validated is not**: no schema for `--schema` output
   exists, and nothing validates the document. The `schema.json` burgee does publish is the
   family **plugin** schema, whose `title` still reads `flagstaff plugin`. This is F1's gap,
   promoted to a claim.
2. **`packages/burgee/package.json`'s own `description`** says *"drop-in compatible with
   commander and yargs"*. PLAN step 2.1 exists to remove that word from five descriptions and
   is the integrator's, marked *"published claim — stops and asks"*.
3. **Three B4 gates are red as of 2026-09-16**, measured on a forced rebuild in this lane:
   `burgee` bundled **56,859 B** against `max 41,000`; `burgee ÷ cac` **5.44** against
   `max 3.9`; `burgee/commander ÷ commander` **1.631** against `max 1.6`; `burgee/yargs`
   bundled **114,809 B** against `max 112,000`, ratio **1.033** against `max 1`. The last
   result committed under `benchmarks/results/cli-benchmarks/` is dated 2026-09-15 and reads
   `burgee` **40,562** and `burgee/yargs ÷ yargs` **0.990**, so the published numbers predate
   the plugin host (#334, #339). `benchmarks/**` and `.sdlc/bands/**` are the integrator's:
   **the numbers are reported here and nothing is edited.** The package's own dist-byte
   ratchet (`src/weight.test.ts`, 32 cases) is green — it is the *bundled* measurement that
   moved.

## Where this document and the code disagree (2026-09-15)

> **Superseded by [What is built, requirement by
> requirement](#what-is-built-requirement-by-requirement-2026-09-16), 2026-09-16.** That
> section reads all 114 requirements; this one read a subset, and **three of its entries have
> since closed** — E5, O5 and the structural `definePlugin` finding. One more, F1, has moved
> without closing: the reason it gives is no longer the reason it fails. It is kept whole and
> unedited below, with each of those four marked where it stands,
> because a bar that is restated and then vanishes is indistinguishable from one that was
> quietly met. Every entry **not** marked closed was re-checked against the tree on
> 2026-09-16 and still holds.

Recorded rather than tidied away. E5 and O5 are already known and reported by other lanes and
are listed only so that this is one list rather than three.

**Already known.** **E5** — SIGINT restoring the terminal and exiting 130: `src/shutdown.ts`
wires closeout, but `ExitCode.SIGINT` is never produced by the engine. **O5** — stdout
flushed before any exit path: the flush phase covers the host's own streams, so an injected
`stdout` is never flushed.

> **E5 and O5 closed 2026-09-16.** `src/shutdown.ts` binds closeout's `install()` and the
> drain goes in the `flush` phase, ahead of `release` and `restore`; `execute.ts`'s `leave()`
> is the one door out and is awaited. `pty-signal.test.ts` grades Ctrl-C at a **real**
> terminal: the child dies *of* `SIGINT`, `WIFSIGNALED` with signal 2, which is what 130
> actually means. The injected-`stdout` half of O5 stands — `detachedTeardown()` takes no
> streams — but an injected `{ write }` has nothing buffered to drain.

**The structural one.** **`definePlugin` is not the family plugin shape**, as set out above.
Any document that describes burgee as declaring the shape the layers register against — this
design does not, but the workspace plan reads that way — is describing something the code
does not do.

> **Closed 2026-09-16** by #334 and #339. `src/plugin.ts` declares `Plugin` with `contract`,
> `validate()` and `PluginError`; see *How a consumer extends it, as of 2026-09-16* above for
> the finding-by-finding reading.

**Requirements the code does not meet.**

- **F1** — "validating against a JSON Schema published with the package". No schema artifact
  exists; `files` is `dist` and `locales`, and `schema.ts` only stamps `schemaVersion: 1`.
  > **Moved 2026-09-16, and still not met.** A schema artifact *does* exist now — `exports`
  > carries `"./schema.json": "./dist/schema.json"`, put there by `schema-to-dist.mjs` and
  > pinned by `scripts/pack-list-lock.test.ts`. It is the wrong schema: it is the **family
  > plugin** schema, byte-identical across six packages and still titled `flagstaff plugin`,
  > and it describes what a plugin object may contain. Nothing describes or validates
  > `--schema`'s own output. So the sentence to read is no longer "no schema artifact exists"
  > but "the artifact that exists is for a different document".
- **F2** — "`--help --json` prints help as data". There is no JSON help surface: the help
  path returns rendered text and the writer emits that text verbatim, so `--help --json`
  prints the same prose as `--help`.
- **O2** — the engine never consults `NO_COLOR` or `FORCE_COLOR`. The requirement is
  satisfied by never colouring, which is not the stated policy.
- **E3** — "every error carries `code`, `message`, `hint`, and where possible `fix`". The
  error body is `{ code, message, hint }`; there is no `fix`, in a family where every other
  refusal has one.
- **E6** — there is no `AUTH` code, although the requirement calls it "the most actionable
  single code in the survey".
- **E7** — the taxonomy is not declarative. Classification is `instanceof` over a fixed set
  with `RUNTIME` as the fallback; nothing lets an author declare a class.
- **V8** — there is no `config explain` command. `--explain <option>` exists.
- **S4** — the `--` pass-through half is built; `-` meaning stdin is not, and `ArgumentSpec`
  has no `type` field for a positional to be file-typed in the first place.
- **P2** — the non-TTY prompt error is specified as exit 2; the nearest mechanism
  (`ctx.actionRequired`) exits 4, and there is no prompt-to-`USAGE` path in the package.
- **D1 / M5** — a deprecation does not *require* a replacement. `deprecated` is
  `boolean | string`, and `true` renders a bare marker and warns with no replacement named.
- **D3** — completions never execute the CLI, which is the half that matters; but there is no
  `dynamic` marker on an option, so the escape hatch the requirement describes does not exist.
- **M1** — "every command carries a group" is not enforced; `group` is optional and the help
  renderer falls back to a default heading.
- **N6** — ~~`effects` is optional, not required. A command that omits it is silently not
  served as a tool rather than failing at definition time, which is the quieter of the two
  failures.~~ **Closed 2026-09-17.** A runnable command that declares no `effects` is refused
  by `checkCommand`, so `defineCommand` and `Manifest.use()` both throw where the command is
  written. Declining stays possible and is now something an author says: `effects:
  'withheld'`, a fourth value of the same field. It is not `'none'` — which reads as *this
  command has no effects*, i.e. `read_only`, the one value it could be confused with — and it
  is not a second boolean field, because a boolean beside a now-required `effects` would mean
  that declaring what a command does to the world silently opts it into the tool list, and
  *that* field's default would be the silence this change exists to remove. One field, four
  answers, no default, so there is no state in which forgetting is possible. `toolsOf`'s
  filter is unchanged, which is the point: it did not have to become less strict for the
  failure to become loud. **Two limits, stated rather than implied.** The refusal is on
  burgee's own declaration API; a command built through the commander or yargs façade reaches
  the manifest without passing that door, because neither incumbent has a notion of effects
  and their graded suites (1360/1360 and 804/804, both `▲ 0` after this change) declare none —
  so a façade user's command is withheld in fact and cannot be made to say so. And `effects`
  stays optional on the *type*: TypeScript cannot make a field's presence depend on a
  sibling's without splitting `Command` into a union that would cost the option-spec inference
  every caller relies on, so the check is at definition time and not at compile time.
- **N13** — drilling is by command path only; there is no field-path selector.
- **N14** — `--json` is a plain boolean. It takes no argument, so nothing lists valid fields
  or rejects an invalid one.
- **N15** — there is no non-JSON `agent` format. The only format flag in the package is
  `--format=json-pretty` on the schema surface.
- **J3** — there is no single explicit opt-in call that turns on behaviour-changing
  guarantees for a façade user.
- **J4** — "the program wins" is built and tested; "burgee's surface is withheld, reported by
  `--schema`" is not — no schema type carries a withheld-surface field.
- **T1** — `runBurgee` builds a full fake runtime and forwards only `argv`, `env`, `stdout`,
  `stderr`, `exit` and `root`. `stdin`, `cwd` and TTY-ness are dropped, so passing `tty: true`
  to the harness has no effect on a burgee program. This is the one on the list most likely
  to make a test pass for the wrong reason.
- **K1 / Z3 / U1** — "zero runtime dependencies" and "`burgee` → ∅" are not true:
  `package.json` declares `closeout`, `linegauge`, `roundel` and `seniority`. They are
  same-repo, which is the U6 shape, but the requirement as written says zero and says ∅.
- **U13** — "`import 'burgee'` never resolves a family specifier". `src/index.ts` statically
  re-exports from `seniority/precedence`, `src/execute.ts` imports it statically, and
  `src/contrast.ts` statically imports `roundel/contrast`. The build is `tsc`, so those
  specifiers survive into `dist`.
- **Every requirement held by `L` is unimplemented, because the plugin that would hold it
  does not exist.** `eslint-plugin-cli-floor` is an intent directory and not a package;
  `packages/` contains ten directories and none of them is it, and `eslint.config.mjs` does
  not reference it. That covers `no-console-in-command`, `require-json-output`,
  `require-command-example`, `no-prompt-without-flag`, `deprecated-requires-replacement`,
  `no-reserved-option-names`, `exit-code-constant`, `no-help-on-runtime-error` and
  `env-option-documented` — and it means the `Holds` column's `L` and `R + L` rows are
  claims about a future package, not about the floor as shipped.

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
