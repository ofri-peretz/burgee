# Intent — An agent-native CLI framework, drop-in compatible with commander and yargs

> Stage 1 artifact of the AI-native SDLC. Opened from the 2026-09-05 npm-trends read
> (commander, yargs, oclif, chalk) and a full read of the 329 open issues across the
> six leading CLI libraries — see `.sdlc/research/competitor-open-issues.md`.

**Status:** approved · **Opened:** 2026-09-05 · **Owner:** @ofri-peretz

> **Accepted at the Design→Build gate 2026-10-25** by the coordinator under the owner's delegation
> ([`D-20261025-burgee-umbrella-design-accepted`](../../decisions/D-20261025-burgee-umbrella-design-accepted.md)): approved as the umbrella over its children; Z5 restated to a 250-command bench, criterion 4 to a disabled-rule ratchet. See
> [`spec.md` § Design gate 2026-10-25](./spec.md#design-gate-2026-10-25).

**State assigned 2026-09-09** from repo evidence, at the owner’s direction. **Why `review` until 2026-10-25:** a living umbrella that keeps gaining floor requirements (U1–U12, then Y1–Y12); it closes when its children do, not before.
**Restructured:** 2026-09-06
**Restated:** 2026-10-18 — see § Restated 2026-10-18

---

## Restated 2026-10-18

**Criteria restated to what shipped on `main` (`1013b65db5`): criteria 1, 2 and 5 held, criterion 3 moved to the eslint repo, two constraints and one recorded decision reversed — class REMAINING: Z4 (15-line README ceiling unlocked), Z5 (250-command bench absent), criterion 4 (runtime packages disable rules).** *2026-10-19: Z4's ceiling is locked; Z5 and criterion 4 remain, and the umbrella stays `review`.*

The roadmap tracker ([`roadmap-to-shipped-2026-10.md`](../../research/roadmap-to-shipped-2026-10.md), audited at `c51e25efe1`) counts this
umbrella at **119 requirements — the spec's 114 rows plus the five success criteria below — with
110 holding a check on main.** Those 110 are unchanged by this restatement and are not re-listed
here; the spec's own audit (*What is built, requirement by requirement*) carries each one with
its check. This section covers the nine the tracker found unmet, and the text in this file that
shipped code contradicts. Nothing below is deleted: each superseded line is struck where it
stands and points back here.

### The five success criteria

| criterion | promised | on main | check | disposition |
| :-- | :-- | :-- | :-- | :-- |
| 1 | `--schema \| jq` returns the full tree; a lock pins the JSON shape | `--schema` prints the tree with `schemaVersion`, validated against the published `burgee/program-schema.json` (D-123) | `packages/burgee/src/schema.test.ts` › "is the manifest as data: name, version, commands with arguments, options, effects, examples"; `scripts/program-schema.test.ts` › "accepts what the native surface prints, which names --explain (D-20261009-b1-totals-and-explain)" | held |
| 2 | ≥40% fewer tokens and ≥30% fewer turns than plain commander, under `claude -p`; becomes a control band | The `agent` axis runs in CI; since D-20261009-b1-totals-and-explain the claims are settled on totals. Over the 50 CI readings dated 2026-10-10 to 2026-10-18 in `benchmarks/results/agent-cli-bench/`, the token ratio has median **0.504** (range 0.434–0.627) and the turn ratio median **0.524** (0.446–0.634). One reading misses the token bar (`2026-10-18-52e996d-ci.json`, 0.627); no reading misses the turn bar. The two bands (`agent-tokens-per-task`, `agent-turns-per-task`) are in `.sdlc/bands/control-bands.json` | claims `agent-tokens-40pct` and `agent-turns-30pct` in `benchmarks/claims.ts`; `scripts/claim-table-lock.test.ts` › "never marks a claim met that the newest CI measurement of it does not satisfy"; `benchmarks/agent.test.ts` › "records a dead run as a failure with no numbers, never as a zero-token success" | held, with the one miss stated: one run is not a verdict, and the median is |
| 3 | `eslint-plugin-cli-floor` ships ≥10 rules with fixtures and flags ≥1 real finding on three internal CLIs | The plugin is not in this repository. D-124 (2026-09-23) placed the lint half in the Interlace ESLint monorepo; it merged there as ofri-peretz/eslint#1137 (`464385ff7`) with **four** rules. The `eslint-plugin-cli-floor` intent here was dropped by the coordinator's ruling of 2026-10-18 | in the eslint repo, not here: `packages/eslint-plugin-cli-floor` and its intent `docs/intents/cli-floor-rules` | moved → eslint repo `cli-floor-rules` (eslint#1137). That intent states four rules and a first run over burgee's demos; the "≥10 rules" and "three internal CLIs" bars are **not** carried there, and are not this repository's to close |
| 4 | the repo's lint runs ≥9 Interlace plugins with zero disabled rules in the runtime packages | First half true by reading: `eslint.config.mjs` imports 31 `eslint-plugin-*` packages. Second half false: at least 19 override blocks set rules `"off"` for non-test files under `packages/*/src/` (burgee's `mcp.ts`, `manifest.ts`, `execute.ts`, `config.ts` among them) | none — no lock reads `eslint.config.mjs` for either half | remaining |
| 5 | zero prompts, spinners or ANSI in captured output when stdout is not a TTY, pinned by a test that runs the CLI through a pipe | Restated to what each part is held by. **ANSI:** the README quick start's CLI is spawned with piped stdio and its stdout and stderr must equal the README transcript byte for byte, which carries no escape byte; help on a non-TTY carries no SGR (in-process, `isTTY: false`). **Prompts:** a question nobody can answer in a non-TTY exits 2 naming the flag (P2), and caique refuses under a detected agent even on a terminal (N12). **Spinners:** the engine draws none; the output stack's spinner has a static projection (U3) | `packages/burgee/src/shape.test.ts` › "$ node cli.mjs %s" (one case per transcript session, both READMEs); `packages/burgee/src/color.test.ts` › "is styled on a terminal, and only there"; `scripts/prompt-exit-codes.test.ts` › "a question nobody can answer — no TTY — exits 2, naming the flag to pass instead"; `packages/caique/src/decide.test.ts` › "refuses under %s even on a terminal" | restated, held. Stated limit: no test asserts zero escape bytes on a *spawned* `--help`; the help pin is in-process |

### The nine unmet rows, and where each went

| row | promised | disposition |
| :-- | :-- | :-- |
| Z4 | the README's first example is ≤15 lines, no build step — held by a lock | The no-build half is held: `packages/burgee/src/shape.test.ts` › "the user authored exactly one file, and never ran a build", and the quick start is run from the README itself. The example is 11 lines in both READMEs (re-counted 2026-10-19, comment and shebang included). **Since 2026-10-19 a lock reads its length:** `scripts/readme-first-example-lock.test.ts` › "burgee’s first example is 15 lines or fewer (Z4)", proven red by five comment lines added to `packages/burgee/README.md`'s example (`expected 16 to be less than or equal to 15`). The ceiling is **held** |
| Z5 | manifest in memory by default; precompute an opt-in, with a benchmark for the 250-command case (yargs #1005) | In-memory half held: `examples/conformance/src/modularity.test.ts` › "serves --help and --schema without importing a single lazy handler", over `examples/demo-cli-large`'s 30 commands. No precompute path was built, and **no 250-command fixture or bench exists** in `benchmarks/` or `examples/`. The bench is **remaining** |
| F3, O3, P1 | the lint rules `require-command-description`/`require-command-example`, `no-console-in-command`, `no-prompt-without-flag` | moved → eslint repo `docs/intents/cli-floor-rules` (eslint#1137, D-124); `eslint-plugin-cli-floor` dropped here by the coordinator's ruling, 2026-10-18. The runtime halves (O1, O2, P2, P3) stay here and are held |
| U12 | each layer an independent product; locks when the independence test passes **and** the first adopter installs a layer alone | Engineering half held (D-20261009-burgee-u12-1-0): `scripts/independence-install-lock.test.ts` › "installs nothing but itself and the in-family packages it declares", "reaches no package it does not declare". Outside adopter: moved → `first-adopter` A6 (added 2026-10-19: "one CLI we did not write installs a single layer alone, without burgee"), tracked as gap `.sdlc/gaps/C3.md`. The 2026-10-18 caveat, that A1 named the dropped `commander-agent`, is answered there: A1 is restated and A6 owns this |
| criteria 3, 4, 5 | see the table above | moved, remaining, held |

### Text that shipped code contradicts

| text | what shipped | reversed by |
| :-- | :-- | :-- |
| Constraint 1: commander and yargs are peers behind adapters; no argv parsing of our own; the core never imports a parser | The engine parses argv itself over `node:util`'s `parseArgs` (`packages/burgee/src/execute.ts`), and the two façades implement commander's and yargs' APIs in our source, never wrapping the real packages, which exist only inside the private `compat-oracle` (spec J9) | the decision of 2026-09-06 recorded in `.sdlc/intents/README.md` § *The roadmap in one paragraph* — "we are building a competitor to commander and yargs, not a layer on top of them" — and this file's own *What is wanted* point 1, restructured that day. Held by `packages/burgee/src/weight.test.ts` › "imports only what its rule allows" (`./commander` allows nothing; `./yargs` allows only the in-family `linegauge`, D-20261010-yargs-entry-allows-linegauge) and `scripts/package-shape-lock.test.ts` › "installs nothing from outside this repository — dependencies, peers or optional (D-111)" |
| Constraint 2: zero runtime dependencies in the core; Node 24 | No dependency outside this repository; in-family packages allowed. Node `^20.19.0 \|\| >=22.13.0` | D-111 (K1, Z3) and D-132 (K2). Held by `scripts/package-shape-lock.test.ts` › "installs nothing from outside this repository — dependencies, peers or optional (D-111)" and › "is ESM, requires Node ^20.19.0 \|\| >=22.13.0, and declares no legacy main (K2)" |
| Constraint 3: a CLI on the layer remains a plain commander or yargs program; the parser instance is reachable | A program on `burgee/commander` or `burgee/yargs` runs on burgee's engine; there is no commander or yargs instance to reach. What survives is the compatibility the constraint was protecting: commander's own suite passes **1,360 / 1,360** against commander 15.0.0 and yargs' **816 / 816** against 18.2.0 (`benchmarks/results/cli-benchmarks/2026-10-12-d8569f5-ci.json`; vendored versions in `packages/compat-oracle/vendor/*/.source.json`) | the same 2026-09-06 decision, and spec J9 |
| Open question *Agent-detection contract*: "No process or `CLAUDECODE` sniffing" | `packages/burgee/src/agent.ts` probes `AI_AGENT`, `CLAUDECODE`, `CURSOR_AGENT`, `CODEX_THREAD_ID` and `GEMINI_CLI`; under any of them a run is not interactive, and `FORCE_TTY=1` overrides. Shipped in #12 (`cd9b88a864`, 2026-09-07) as spec N12 | spec N12; D-181 (2026-09-28: roundel's `interactive()` is the one rule, agent variables included) and **D-20260930-one-interactive-rule** (2026-09-30, the owner's answer: the same rule, exactly five variables, never `CURSOR_TRACE_ID`). No decision file names the 2026-09-06 line as the thing it overturns; this row is that record. Held by `packages/burgee/src/agent.test.ts` › "names the agent from the environment and turns interaction off, terminal or not" and › "probes the same five variables roundel does, in the same order, and never CURSOR_TRACE_ID" |
| Open question *Where the ESLint plugin lives*: here, in `packages/eslint-plugin-cli-floor` | in the Interlace ESLint monorepo | D-124 (2026-09-23), then the coordinator's ruling of 2026-10-18 dropping the intent here |
| Open question *Package names*: host-branded `commander-agent`, `yargs-agent`, `commander-schema`…, sharing `@interlace/cli-core` | one package, `burgee`, with `burgee/commander` and `burgee/yargs` subpaths; `commander-agent` and `yargs-agent` are dropped intents | the 2026-09-06 competitor decision above; the two `*-agent` intents' own `dropped` headers |

## What is wanted

A **CLI framework that replaces commander and yargs**, is drop-in compatible with both,
and serves every command it is given through every format a caller might want — human,
machine and agent — from a single declaration.

Three things at once, and all three are required; any two of them is a project that
already exists and lost.

**1. A competitor, not a layer.** One engine owns argv, the lifecycle, validation,
precedence, help and output. Not an adapter over someone else's parser.

**2. Full compatibility with both incumbents**, so migration is one import line.
`burgee/commander` exposes commander's 151 public methods; `burgee/yargs` exposes
yargs' 108. The claim is not the word "compatible" — it is a published pass rate against
their own suites: **1,215 commander tests and 1,185 yargs tests**, run in our CI on every
PR, ratcheting, never edited to pass. **2026-10-18:** the suites graded today are commander's
1,360 (v15.0.0) and yargs' 816 (v18.2.0), both passing in full
(`benchmarks/results/cli-benchmarks/2026-10-12-d8569f5-ci.json`). vitest overtook jest this way (99.9M/wk against
48.0M); stricli invented a new API and earns 16 downloads a week.

**3. Every command served in every format, from one declaration.** This is the reason to
switch and the part neither incumbent will ever build. One command declaration becomes:

| Surface | What the caller gets |
| :--- | :--- |
| human help | rendered from the manifest, not hand-written |
| `--json` | one stable envelope: `{ ok, data, error?, meta }` |
| `--schema` | the full typed command tree, versioned, JSON-Schema validated |
| `--mcp` | an MCP server: every command a typed tool, generated |
| completions | bash, zsh, fish, PowerShell, generated statically |
| Fig spec | the same node, a different emitter |
| docs and `llms.txt` | generated, never drifting from the code |
| TypeScript types | derived from the schema, not declared twice |
| lint rules | `eslint-plugin-cli-floor` holds the floor statically — **moved 2026-10-18:** built in the Interlace ESLint repo (D-124, eslint#1137), not here |

An author writes the command once. Every one of those surfaces is a projection of the
same manifest, which is why they cannot drift, and why adding a tenth surface is an
emitter rather than a feature.

Concretely, once this lands:

1. A CLI answers `--schema` with its full command tree as versioned JSON, and `--json`
   on every command with one stable envelope. An agent learns the whole CLI in one call
   and never parses prose.
2. `--mcp` serves that same CLI as an MCP server with no additional author effort.
3. In a non-TTY or agent session the CLI never prompts, never spins, never redraws,
   never prints help on a runtime failure, and every error carries the exact flag or
   command that fixes it.
4. An existing commander or yargs CLI migrates by changing one import, and its own test
   suite still passes.
5. ~~The floor is also enforced statically by `eslint-plugin-cli-floor`, so a CLI that has
   not migrated can still be held to it — the adoption wedge that costs no runtime change.~~
   **Moved 2026-10-18** to the Interlace ESLint repo (`docs/intents/cli-floor-rules`,
   eslint#1137) — see § Restated 2026-10-18.
6. The repo runs on the Interlace ESLint ecosystem and is the reference consumer for it.

## Why now

- **The market is transitive, not chosen.** commander and yargs downloads track total
  npm install volume, and the 2025→2026 spike tracks AI coding tools shipping CLIs on
  them. A new parser has no entry point: citty with UnJS/Nuxt distribution sits at
  3 releases in 24 months; oclif, the only full framework, is the flat line at the
  bottom of the chart after eight years.
- **Compatible replacements are the only challengers that have ever won.** vitest copied
  jest's API and overtook it; pnpm copied npm's surface; rolldown is closing on rollup;
  preact/compat holds a durable niche. Biome, which asked users to rewrite their config,
  is the slowest of the six. Every post-2015 framework that invented an API lost:
  stricli 16/wk, gunshi 72k, cmd-ts 225k, clerc 27k. Copy the API, never invent one.
  See `.sdlc/research/competitor-landscape.md` §5.
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

- **Repo** `ofri-peretz/burgee`, sibling of `eslint/` and `interlace/`, a turborepo like
  every Interlace repo, under the same AI-native SDLC (`../AI_NATIVE_SDLC.md`). It
  replaces a stale fork of Shopify's CLI that previously held the name (wiped
  2026-09-05, zero own commits).
- **`apps/docs`**, the documentation site (Next.js + fumadocs, as in `eslint/apps/docs`),
  where the floor, the research and every rule are published.
- **`eslint/` monorepo** gains only a `cli` preset in `eslint-config-interlace`,
  depending on `eslint-plugin-cli-floor` ~~published from this repo~~. **2026-10-18:** the
  plugin itself lives and publishes there (D-124, eslint#1137).
- **Interlace's own CLIs**: `interlace-ui` (interlace repo), the `scripts/*.ts` CLIs
  in the eslint repo, the agents-repo skills' shell entry points. They become the
  first consumers and the first benchmark subjects.
- **Published numbers that move**: npm download counts for the new packages, the
  Interlace plugin count, and a new control-band metric: agent tokens-per-task.

## Constraints

1. ~~**commander and yargs are peer dependencies behind adapters, not forks.** No argv
   parsing of our own. If a parsing bug matters, it is fixed upstream. The core never
   imports a parser; an adapter does.~~ **Reversed** by the 2026-09-06 decision to build a
   competitor rather than a layer (`.sdlc/intents/README.md`); the engine owns argv and the
   façades depend on nothing (spec J9). See § Restated 2026-10-18.
2. ~~**Zero runtime dependencies** in the core package. ESM-only,
   Node 24 natives (`util.styleText`, `util.parseArgs` not needed, `fs.glob`,
   `process.stdout.isTTY`).~~ oclif/core #1627 is the cautionary tale. **Restated:** no
   runtime dependency outside this repository (D-111), and Node `^20.19.0 || >=22.13.0`
   (D-132); `util.parseArgs` is what the engine parses with.
3. ~~**A CLI using the layer must remain a plain commander or yargs program.** The
   parser instance is reachable; every parser API works.~~ Adoption is additive.
   **Reversed** with constraint 1: a program on a façade runs on burgee's engine, and
   "every parser API works" is held instead by the incumbents' own suites (spec J1).
4. **Dogfood the ecosystem.** The repo runs `eslint-config-interlace` `quality` +
   `node-security` + `secure-coding` recommended, the react plugins on the docs app, oxlint fast pass, lefthook, changesets, turbo —
   the same tooling as `eslint/` and `interlace/`.
5. **AI-native SDLC from day one.** `.sdlc/intents/` with the lock, `evals/` layer 1,
   control bands with at least one band computing before v1.
6. **Every floor rule has a lint rule or a runtime guarantee.** A rule that has
   neither is a suggestion, and suggestions are not a floor.

## Success criteria

- `npx <any-cli-on-the-layer> --schema | jq` returns the full command tree; a lock
  test pins the JSON shape. **Held** (§ Restated 2026-10-18).
- An agent benchmark (`benchmarks/agent-cli-bench`) shows **≥40% fewer tokens and
  ≥30% fewer turns** to complete a fixed task set against a layered CLI versus the
  same CLI on plain commander, measured non-interactively with `claude -p`. The
  metric becomes a control band. **Held** on the median of 50 CI readings, one token
  reading over the bar stated (§ Restated 2026-10-18).
- ~~`eslint-plugin-cli-floor` ships ≥10 rules, each with a positive and negative fixture,
  and flags ≥1 real finding on each of the three internal CLIs on first run.~~ **Moved
  2026-10-18** to the eslint repo (eslint#1137, `cli-floor-rules`), which states four rules.
- The repo's own lint runs ≥9 Interlace plugins with zero disabled rules in the
  runtime packages. **Remaining** (2026-10-18): 31 plugins wired, at least 19 override
  blocks still switch rules off for runtime source, and no lock reads either half.
- Zero prompts, spinners or ANSI in captured output when `stdout` is not a TTY —
  pinned by a test that runs the CLI through a pipe. **Restated and held** (2026-10-18):
  the piped README transcript run, the non-TTY help pin, P2 and N12 — see § Restated
  2026-10-18 for the limit.

## Verified against `main` — 2026-09-09

Checked criterion by criterion on `61bd11b9`. **One of five met, one half met.** The status
stays `review`: this is the umbrella, its criteria are the family's acceptance bar, and two of
them have no implementation of any size behind them.

- **`--schema | jq` returns the full command tree, with a lock pinning the JSON shape** —
  **met.** `node examples/demo-cli-burgee/dist/bin.js --schema | jq` returns `schemaVersion: 1`
  with the full tree; `packages/burgee/src/schema.test.ts` pins the shape with five assertion
  cases rather than a snapshot.
- **An agent benchmark showing ≥40% fewer tokens and ≥30% fewer turns, becoming a control
  band** — **not met, and nothing exists to make it smaller.** There is no `benchmarks/`
  directory, no `agent-cli-bench` suite and no `bench` script. The two bands are declared in
  `.sdlc/bands/control-bands.json` (`agent-tokens-per-task`, `agent-turns-per-task`,
  `minPoints: 8`) with **zero observations**. This is the headline claim of the whole roadmap
  and it has never been measured once.
- **`eslint-plugin-cli-floor` ships ≥10 rules, each with fixtures, flagging ≥1 real finding on
  three internal CLIs** — **not met.** The only thing named `cli-floor` in this repo is the
  intent directory. No package, no rules, and a 404 on npm.
- **≥9 Interlace plugins with zero disabled rules in the runtime packages** — **half met.**
  Eleven Interlace plugins are wired in `eslint.config.mjs`, so the first half holds. The second
  does not: roughly thirteen override blocks switch rules `off` for runtime source, including
  `packages/burgee/src/config.ts` (seven rules), `mcp.ts`, `manifest.ts`, `runtime.ts`, `cli.ts`,
  `execute.ts`, `help.ts`, `schema.ts`, `yargs-parser.ts`, `yargs-utils.ts`, and
  `packages/flagstaff/src/cli.ts` and `plugin.ts`.
- **Zero prompts, spinners or ANSI in non-TTY output, pinned by a pipe test** — the behaviour
  holds, the pin does not. Measured: a piped `--help` from `demo-cli-burgee` contains **zero**
  ESC bytes. But no burgee-side test asserts their absence — `packages/burgee/src/shape.test.ts`
  pipes and would only break on ANSI incidentally, through `JSON.parse`. The explicit pins live
  a layer down, in `roundel/src/shape.test.ts:70` and `flagstaff/src/log-update.test.ts:74`,
  neither of which is a CLI on the layer.

**One recorded decision in this file is now contradicted by shipped code.** The open-questions
section states the agent-detection contract as `!isTTY(stdout) || CI || --json || --schema`,
with "**No process or `CLAUDECODE` sniffing**". `packages/burgee/src/agent.ts` probes
`AI_AGENT`, `CLAUDECODE`, `CURSOR_AGENT`, `CODEX_THREAD_ID` and `GEMINI_CLI` — that is N12,
added later by `commander-env`, and it reverses this decision. The reversal should be recorded
here rather than left as a contradiction between an intent and the code it governs.
**Recorded 2026-10-18** in § Restated 2026-10-18, with the decisions that made it.

## Open questions

- ~~**Package names.**~~ **Superseded** (see § Restated 2026-10-18: one package, `burgee`,
  with host subpaths). Decided 2026-09-05: public packages are **host-branded
  extensions, unscoped**, the way `eslint-plugin-*` is: `commander-agent`,
  `yargs-agent`, then `commander-schema`, `commander-env`, `commander-completions`,
  `yargs-json`, … one per layer per host, each in its host's extension idiom. The
  shared contract is the internal scoped `@interlace/cli-core` (the
  `@interlace/eslint-devkit` precedent). No `@interlace/*` on anything public. All
  names above were free on npm on 2026-09-05; `yargs-schema` and
  `commander-testing` are taken.
- ~~**Where the ESLint plugin lives.**~~ Decided 2026-09-05: here, in
  `packages/eslint-plugin-cli-floor`, on `@interlace/eslint-devkit`. Everything for the CLI
  space is under this one repo. **Reversed** by D-124 (2026-09-23): the Interlace ESLint
  monorepo, eslint#1137.
- ~~**Agent-detection contract.**~~ Decided 2026-09-06: `!isTTY(stdout) || CI || --json
  || --schema`. ~~No process or `CLAUDECODE` sniffing~~; `--json` means no human is present.
  **Reversed** by spec N12 (shipped 2026-09-07, #12), D-181 and
  D-20260930-one-interactive-rule: five agent variables, `CLAUDECODE` among them, and
  roundel's `interactive()` as the one rule. See § Restated 2026-10-18.
- ~~**Schema library.**~~ Decided: Standard Schema is the only external contract; a tiny
  built-in type set (`flag`, `string`, `number`, `choice`, `file`, `path`, `object`) keeps
  the core zero-dependency. See `commander-schema`.
  **2026-10-25:** that set did not ship as written. Options are `string`, `boolean` and
  `number`, and positionals add `integer` and `file` (`typed-positionals`). The option `file`,
  `path` and `object` types are ruled out by
  [D-20261025-commander-schema-dropped](../../decisions/D-20261025-commander-schema-dropped.md).
- ~~**Relationship to clack.**~~ Decided 2026-09-06: wrapped. **Re-decided 2026-09-08:** not a
  dependency at all. `caique` implements prompts over Node natives; `caique/clack` is a
  migration path graded by clack's suite. See `cli-output-stack` U6, U11.
