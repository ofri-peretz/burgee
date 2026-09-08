# `docs/intents/` — Stage 1 (Plan) and Stage 2 (Design)

Every substantive change starts here. See `AI_NATIVE_SDLC.md`, one level above this
repo, for why. Layout and status values are the same as in `eslint/`: one directory per
intent, `intent.md` then `design.md`, statuses `draft → review → approved → shipped`
(or `dropped`), and `approved` requires a `design.md` beside it.

## The message

**A framework that everyone extends with AI agents, that beats every incumbent it replaces,
and that moves faster than any of them.** Each clause is a mechanism on this page, not a
slogan: *extend with agents* is U4, U9 and the plugin contract (plugins are data, one
schema, one-turn authoring measured weekly); *beats every incumbent* is U5 and U11 (lighter
per subpath, graded by their own suites, every number published); *moves faster* is the
cadence and the two maintenance bands (a month per wave, seven days to track an upstream
release, fourteen to close an accepted issue). Everything below exists to make one of the
three true and provable.

## The roadmap in one paragraph

**Decided 2026-09-06: we are building a competitor to commander and yargs, not a layer on
top of them.** One engine owns argv and the lifecycle, drop-in compatible with both
incumbents and graded by their own tests, serving every command through every format a
caller wants — all projections of one manifest. **Extended 2026-09-08: the same play,
repeated for every layer of CLI tooling.** Four packages, each an independent product that
is drop-in for the incumbent it replaces and lighter than it: `burgee` (the engine),
`roundel` (colour and theme), `flagstaff` (rendering and plugins), `caique` (prompts).
Together they are **the full toolset for CLI builders** — zero external dependencies,
one plugin contract across all four, and every caller (human, agent, CI, screen reader,
another program) served by design rather than by fallback. Compatibility makes it cheap
to try; the surfaces are the reason to switch; the plugin contract is how others spread
it. Throughout, one constraint outranks every feature: **each package stays a library you
import in one file, not a framework you scaffold into.** And one more, stated 2026-09-08:
**nothing here runs as a service.** Every product is a package; the MCP server is stdio,
the scoreboard is a static page, the gallery is generated. That is where the edge is — in
the product layer the whole ecosystem installs, not in infrastructure we would have no
advantage running — and it is why the thing can be maintained by two, sponsored rather than
hosted, and installed by an agent inside any sandbox with no account and no network. The
economics are the rule's real form: **today the whole family costs time and one model
subscription, so it can stay open and be patient indefinitely.** The first hosted component
would carry a bill every month, which makes it a for-profit product by necessity — a
separate decision with a price on it, never a feature of the family.

## The minimum that proves the play

Thirty-three intents is a map, not a bet. The bet is three things. If they land, everything
else on this page is justified; if they do not, nothing else on it should be built first.

1. **The commander scoreboard is public** — the compatibility page deployed, the number
   ratcheting on every PR, the release watch opening issues on upstream releases.
2. **roundel ships at 0.1 under picocolors' weight**, with `roundel/chalk` graded by chalk's
   suite — the first proof that a layer can be independent, lighter, and compatible at once.
3. **One external adopter**, a CLI we did not write, migrated by one import and measured on
   the caller matrix.

Everything below those three is conditional on them, and the kill criteria fire on them.

## Why the three bets can win — precedents and mechanisms

Each bet in the minimum above is a claim about the market, not about the code. A claim
like that is only worth holding if something like it has already happened, and only worth
building on if the roadmap contains a mechanism that makes it happen rather than a hope
that it will. One row per bet: the precedent, the mechanism here, the number that tests it.

| Bet | Precedent — it has happened | Mechanism in this roadmap | The number |
| :-- | :-- | :-- | :-- |
| **A maintainer swaps one import when the number is green** | Biome cleared 95% of Prettier's own suite in 2023 and the published number did the persuading. Vitest took Jest's API plus a reason (speed, ESM); pnpm took npm's package.json plus a reason (disk, strictness); picocolors replaced chalk across the PostCSS ecosystem on weight alone with a near-identical API. Compat removes the cost; a reason supplies the motive. Ours: agent surfaces, zero deps, and the September 2025 compromise of exactly the packages we replace (cite in `output-stack-research`) | `eslint-plugin-cli-floor` gains a **`migrate-import` autofix** (commander → `burgee/commander`, safe at parity) so a lint warning is a one-line PR; `first-adopter` gains the **dependents ranking script** (top dependents of commander/yargs by weekly downloads × backlog rows closed) that turns "someone might" into ten named PRs with their suites green | migration PRs sent, merged; adopters named on the README |
| **Agents do better against a burgee CLI** | The floor is the shape the best agent-native CLI already has: Claude Code's own CLI ships a print mode, `--output-format json`, structured errors and never prompts under a pipe; Anthropic's guidance on writing tools for agents (2025) says what O1–O5 and E1–E5 say — actionable errors, structured output, no hangs. Some wins are binary: a hung prompt in non-TTY is a failed task every time; a usage-vs-runtime exit code tells an agent whether to fix or retry | **B1 as a protocol** in `cli-benchmarks`: tasks × callers, same CLI on commander and on burgee, measuring hangs per 100 non-TTY runs, turns to success, success rate; weekly; the honest fallback (parse reliability, not token economy) already recorded | hangs/100 = 0 by construction; turns and success rate published, hypothesis until they move |
| **A plugin ecosystem forms around a schema** | It already exists as data and nobody hosts it: `cli-spinners` is a JSON file of ~80 spinners used by every spinner library and is flagstaff's spinner shape; `cli-boxes` is border styles as JSON; the iTerm2 colour-scheme repository and base16 hold hundreds of palettes as data, and a palette is a roundel theme; VS Code themes are JSON by the thousand. Data-first plugin formats get authored at scale by one person — this repo's own ESLint plugin portfolio is the lived case | **Importers, not evangelism**: `roundel` ships base16 and iTerm scheme importers (design R11); `flagstaff` ships `cli-spinners` and `cli-boxes` importers (design R11), so the gallery opens with hundreds of entries and the first third-party plugin is a copy of one, edited; the U9 eval measures whether an agent writes one in a turn | gallery entries at launch; third-party plugins registered; U9 pass rate weekly |

## Where the edge is, and for whom

A roadmap is executable when every lane can say what it is for. One row per layer, plus the
family. *Edge* is what no incumbent can add without changing shape; *proof* is the number on
the docs site that says it is true; *value* is who is better off and how we would know.

| Layer | Edge | Why the incumbent cannot copy it | Proof (published) | Value, for whom |
| :-- | :-- | :-- | :-- | :-- |
| **burgee** | one declaration → help, `--json`, `--schema`, `--mcp`, completions, types; plugins | commander has no manifest and refused plugins (#2505); yargs' 108 methods each own a slice of state | commander 1,361/1,361 and yargs 804/804 on their own suites; B2 spawn delta; B1 agent success | CLI authors: no drift between surfaces. Agent builders: a contract instead of scraped `--help` |
| **roundel** | one output policy, semantic tokens, a contrast-checked theme | chalk's model is a global mutable `level`; a policy would break its own tests | B4 rows under picocolors and chalk 6; chalk pass rate; the policy truth table | Authors: one answer to "is this a terminal?". Users: readable errors on every background |
| **flagstaff** | the static projection is the artifact; plugins are data; an agent can write one in a turn | ora and Ink are imperative; a React tree has no static form to project | `\r`-free piped transcript; U9 eval green weekly; ora pass rate; B4 under ora | Agents and screen readers: the same clean bytes. Authors: a spinner ecosystem without a framework |
| **caique** | never hangs: flags first, errors with `fix` in non-TTY, accessible by default | clack and inquirer assume a person is present; non-TTY is their bug, not their model | non-TTY benchmark never times out; inquirer and clack pass rates; matrix green | Anyone running a CLI from CI or an agent: the hang, gone. Screen-reader users: prompts that read |
| **the family** | zero external dependencies end to end; one plugin contract; every claim measured | the incumbents are a dozen packages under a handful of accounts — the September 2025 npm compromise of chalk, debug and their siblings hit exactly that cluster (to be cited in `output-stack-research`) | the complete-CLI dependency bill: 0 vs the dozen; one schema byte-identical in four tarballs | The ecosystem: four packages, one repo, one supply chain to audit instead of twelve |
| **native, where measured** | any layer ported to the fastest language and shipped the oxc/esbuild way, graded by the incumbents' own suites | no CLI-tooling incumbent has a prebuild pipeline, a WASM fallback, or a suite-gated way to prove a port changed nothing; adding them is a shape change. Native itself is not the edge — oxc and esbuild did it first — the *suite-graded* port in *this* market is | B2/B4 rows for the native build beside the JS build; the same pass rates | authors of large CLIs: manifest and help at hundreds of commands in microseconds; end users: a single binary with no Node install |

The last row is the one to lead with in public, and the one we have not said out loud yet.

Diagrams: [`architecture.md`](../research/architecture.md).

## The umbrella

[`agent-native-cli-layer/`](./agent-native-cli-layer/) is the parent of everything
below. Its `design.md` carries the **74-requirement floor** (F/O/E/V/S/P/D/T/H/M/K/C/B/N
ids) that every child cites.

Two research documents feed it, and every intent cites one or both:

- [`competitor-open-issues.md`](../research/competitor-open-issues.md) — 329 open issues
  read in full across commander, yargs, oclif, citty and clack, clustered into twelve
  themes. This is where the requirements come from.
- [`competitor-landscape.md`](../research/competitor-landscape.md) — the measured
  competitor map: downloads, cold start, the compatibility bill, the oracle, and why
  the replacement is a third adapter rather than a fork.
- [`architecture.md`](../research/architecture.md) — **the architecture, in diagrams**:
  one declaration to every surface, the shape lock against oclif, engine and front-ends,
  migration, the dev loop, and where a faster language pays.
- [`architecture-review.md`](../research/architecture-review.md) — the honest review:
  nine findings with actions, the declarative plugin design, and the native front-end
  analysis.

## Coverage: every issue cluster has an owner

The roadmap is complete against the research when every cluster in
`competitor-open-issues.md` maps to a shipped or planned intent.

| Research cluster | Owned by | Wave |
| :-- | :-- | :-- |
| §1 machine-readability, agent environments | `commander-agent`, `yargs-agent` | 1, 2 |
| §2 help and usage rendering (largest) | `cli-help-renderer` | 3 |
| §3 config and environment precedence | `commander-env` | 3 |
| §4 validation and option relationships | `commander-schema` | 3 |
| §5 TypeScript inference | `commander-schema` | 3 |
| §6 completions | `commander-completions` | 4 |
| §7 error lifecycle and exit behaviour | `commander-agent` (E1–E5) | 1 |
| §8 modularity for large CLIs | `cli-modularity` | 4 |
| §9 interactive prompts | `caique` | 4 |
| §10 parsing edge cases | `replacement-parser` | 5 |
| §11 runtime and packaging | `cli-packaging` | 1 |
| §12 maintainer signals | `eslint-plugin-cli-floor` (the wedge), plus an article | 2 |
| security market (survey §5) | `security-profile` — both leading scanners get findings-vs-failure wrong | after 3 |

§10 was previously marked *not planned, commander owns it*. Owning a parser (wave 5)
converts it from a permanent dependency into a fixable backlog, so it now has an owner.
§12 stays partly an article rather than a package; that is deliberate.

## The intents

### Foundation — the loop and the gates

| # | Intent | Delivers | Floor ids | Status |
| :-- | :-- | :-- | :-- | :-- |
| 1 | [`sdlc-locks-evals-bands/`](./sdlc-locks-evals-bands/) | intent lock, evals layer 1, control bands | — | shipped |
| 2 | [`cli-testing-harness/`](./cli-testing-harness/) | `Runtime` seam; `burgee/testing`; the compat drivers; the conformance suite | T1 | shipped |
| 3 | [`compat-oracle/`](./compat-oracle/) | upstream suites vendored and redirectable; pass rate as a ratcheting gate; the Node matrix | C1–C6 | review |
| 4 | [`cli-packaging/`](./cli-packaging/) | zero deps, ESM, artifact gate, size ratchet, pay-per-import | K1–K6 | review |
| 5 | [`cli-benchmarks/`](./cli-benchmarks/) | four axes — agent cost, performance, compatibility, weight | B1–B7 | review |

### The engine and its compatibility

| # | Intent | Delivers | Floor ids | Status |
| :-- | :-- | :-- | :-- | :-- |
| 6 | [`commander-agent/`](./commander-agent/) | ~~layer on commander's hooks~~ | F O E M | **dropped** — superseded, requirements moved to the engine |
| 7 | [`yargs-agent/`](./yargs-agent/) | ~~layer on yargs middleware~~ | same as 6 | **dropped** — same reason |
| 8 | [`eslint-plugin-cli-floor/`](./eslint-plugin-cli-floor/) | the L rules; the adoption wedge that needs no runtime change; **`migrate-import` autofix** (2026-09-08) | F3 O1–O4 E1 E2 V2 V5 P1 D1 | review |
| 9 | [`docs-deploy/`](./docs-deploy/) | `apps/docs` on an interlace.tools host, `llms.txt`, the benchmarks page | B7 | review |
| 10 | [`first-adopter/`](./first-adopter/) | a CLI we did not write, using the layer, reviewed by someone who did not build it; **the dependents ranking script** (2026-09-08) | A1–A5 | review |
| 11 | [`cli-mcp/`](./cli-mcp/) | `--mcp` turns any CLI on the floor into an MCP server, generated from the manifest | N1–N5 | review |
| 12 | [`dev-loop/`](./dev-loop/) | `burgee dev` — watch, reload, and serve live MCP so your agent sees a command as you write it | W1–W6 | review |
| 22 | [`brand-burgee/`](./brand-burgee/) | `defineBurgee({ lead, follow })` — favicon, raster set, OG card and theme variants generated from one declaration; the Interlace −30° geometry stays locked | — | draft |

### The gaps — research clusters neither host ships

| # | Intent | Research | Delivers | Floor ids |
| :-- | :-- | :-- | :-- | :-- |
| 13 | [`cli-help-renderer/`](./cli-help-renderer/) | §2 (largest) | one renderer from the manifest; twenty issues by construction | H1–H6 |
| 14 | [`commander-schema/`](./commander-schema/) | §4, §5 | declare once: types, relations, derived TS types | S1–S8 |
| 15 | [`commander-env/`](./commander-env/) | §3 | fixed precedence, `--explain`, provenance, owning package.json | V1–V7 |
| 16 | [`commander-completions/`](./commander-completions/) | §6 | static scripts for four shells, Fig spec | D2–D5 |
| 17 | [`caique/`](./caique/) | §9 | flags first, errors in non-TTY, `--yes`, `--interactive` | P1–P3 |
| 18 | [`cli-modularity/`](./cli-modularity/) | §8 | groups, lazy commands, plugins, shared options, deprecation | M1–M6 |

### Reach

| # | Intent | Delivers | Floor ids | Status |
| :-- | :-- | :-- | :-- | :-- |
| 19 | [`replacement-parser/`](./replacement-parser/) | our parser over `node:util.parseArgs`, as a third conformance host | G1–G7, §10 fixes | review |
| 20 | [`commander-compat/`](./commander-compat/) | `burgee/commander` — commander 15 ported method for method, graded by commander's 1,362 tests; **1,361 / 1,361 (100%)** of those that run on this OS, as the real package scores | X1–X8 | review |
| 21 | [`yargs-compat/`](./yargs-compat/) | `burgee/yargs` — yargs 18 and its whole dependency tree ported method for method, graded by yargs' 804 tests; **804 / 804 (100%)** (real yargs: 802 in the same run) | X1–X8 | review |

### The output stack — what a CLI shows, as a plugin framework

Umbrella [`cli-output-stack/`](./cli-output-stack/) — one package per layer, plugins as
data, every animation with a static projection, weight paid per subpath. Proposes U1–U10.

| # | Intent | Delivers | Floor ids | Status |
| :-- | :-- | :-- | :-- | :-- |
| 23 | [`cli-output-stack/`](./cli-output-stack/) | the layer table, the static-projection rule, the data-only plugin contract, the complete-CLI dependency bill | U1–U10 | approved |
| 24 | [`roundel/`](./roundel/) | **roundel** — `./policy`, `./tokens`, `./theme`, and a chalk path graded by chalk's tests; each subpath at or under the incumbent it replaces | U2 U5 U6 U7 U10 U12 | approved |
| 25 | [`flagstaff/`](./flagstaff/) | **flagstaff** — frame loop, plugin host, built-ins as first-party plugins, `plugin check`; no layout engine | U3 U4 U8 U9 U12 | approved |

| 26 | [`output-stack-research/`](./output-stack-research/) | **what we improve** — the ten incumbents' trackers read in full, won't-fix lists included; every U row cited | U1–U12 | draft |
| 27 | [`output-stack-compat/`](./output-stack-compat/) | **backwards compatibility** — eight façades graded by eight vendored suites; eight scoreboard rows | U11, C1–C6 | draft |
| 28 | [`plugin-contract/`](./plugin-contract/) | **spreading impact** — one plugin object, one schema, one `register()`, one `check`, across all four layers | U4, U9, M4–M5 | draft |
| 29 | [`caller-matrix/`](./caller-matrix/) | **every caller** — features × callers conformance matrix, generated; humans, agents, CI, screen readers, programs | U2, U3, P1–P3, B1 | draft |

`caique` (17) re-parents under this umbrella and peers on `flagstaff` for its spinner.
Every incumbent the stack replaces — chalk, ora, boxen, cli-table3, log-update — gets a
façade graded by its own suite through `compat-oracle` (U11), so "ora-compatible" is a
scoreboard row, and every subpath must measure lighter than the incumbent it replaces
before it publishes (U5). The metrics table is in the umbrella.
Nothing here publishes before `burgee/commander` publishes its pass rate.

Not planned, on purpose: an update checker (citty #10 — a network call at startup is the
opposite of what an agent wants), and non-Node runtimes (claiming Deno and Bun means
testing them, which is its own intent with its own matrix).

## Owner tasks — outside an agent's reach

Recorded here so the roadmap is honest about what a spawned agent cannot do. Each needs the
owner's terminal (npm second factor) or a decision.

| Task | Why the owner | Command / decision |
| :-- | :-- | :-- |
| Republish `pennon@0.0.2` and `answering@0.0.2` as honest reserved-name placeholders | npm 2FA | staged in the session scratchpad; `npm publish --access public` in each |
| Publish the misspelling guards `burgie`, `burgy`, then `npm deprecate` each | npm 2FA | staged in the session scratchpad |
| Remove `packages/commander-harness` and `packages/yargs-harness` (untracked build residue; the shape lock now skips them, so this is hygiene) | sandbox refused `rm` | `rm -rf packages/commander-harness packages/yargs-harness` |
| Record artifact baselines for the three new packages | sandbox refused the write | `npx tsx scripts/check-published-artifacts.ts --update-baseline` and commit `.agent/artifact-size-baseline.json` |
| Decide the fate of the pre-existing brand edits in the working tree (docs icon, flag component, brand assets, `brand.ts`, `cli.ts`, `weight.test.ts`, `scripts/brand.mts`) | not from this roadmap's session | commit under `brand-burgee`, or discard |
| Set `.agent/scoreboard-public.json` when the commander page deploys | opens the R13 gate | the page URL |

## Waves

Re-planned 2026-09-07 after the research pass. Wave 1 ends with something installable and
a **live scoreboard**; every wave after it ends with that number higher.

### Scoreboard

```text
                       burgee                              control (the real host)
compat-commander    ████████████████████████  1361 / 1361  100.0%     ████████████████████████  1361 / 1361  100.0%
  internals                                         12 /   12                                          12 /   12
compat-yargs        ████████████████████████   804 /  804  100.0%     ████████████████████████   802 /  804   99.8%
  internals                                         23 /   23                                          23 /   23
```

Every file of both suites is vendored and run — nothing is excluded. The *internals* lines
are the files that import only the host's own modules (`../lib/command.js`); they are
reported, never gated: passing them would mean copying the host's file layout.

`npm run compat` — each host's own suite, vendored (commander `ba6d13dd`, yargs
`fb9c0559`) and graded through generated shims; `--control` grades each against its real
package first, which proves the gate before it grades anything of ours. The denominator is
the reference total, not the tests that happened to register, so a partial implementation
cannot flatter itself. `burgee/yargs` read an honest 0 until wave 4 built it; falling below
a recorded baseline fails CI (C5) — and the grader's exit code now reaches the job, which a
`| tee` had been swallowing (found when `burgee/commander` had quietly fallen to 689). A suite killed mid-run by a test
calling `process.exit()` is reported as an error, never as a score — it read as "0 / 0"
three separate times before that rule existed.

| Wave | Intents | Ends with | Status |
| :-- | :-- | :-- | :-- |
| 0 | `sdlc-locks-evals-bands`, `cli-testing-harness` | the loop, and a harness that runs a CLI in-process | ✅ shipped |
| **1 · engine** | `replacement-parser`, `compat-oracle`, `cli-packaging` | a one-file CLI that runs, the shape lock green, the first published pass rate | 🔨 engine built · oracle grading commander · packaging next |
| **2 · compatibility** | `commander-compat`, `cli-help-renderer` ↑, `first-adopter` ↑, `eslint-plugin-cli-floor` ↑ | every upstream file graded; `burgee/commander` 1,361/1,361 (= real commander in the same run) and byte-identical to commander on the demo (X7, 29 cases); help rendered from the manifest with `help <cmd>`, groups, examples, env, width from the runtime (H1–H6) | in progress |
| **3 · surfaces** | `cli-mcp`, `commander-schema`, `commander-env`, `commander-completions` | `--schema`, `--mcp`, completions — the reason to switch | 🔨 `--schema`, `--mcp` and static completions for bash/zsh/fish/pwsh + Fig served from the manifest on every program, commander syntax included (N1–N6, N8, N9, D2–D5); one precedence order with `--explain`, `meta.provenance`, config discovery with `extends`, `--version` from the owning package.json (V1–V7); options declared once — inferred types, numbers, `multiple`, choices enforced, relations, Standard Schema, kebab on the CLI (S1–S8); `changed`, the action-required envelope, agent detection, the schema budget (N7, N11–N13) — ✅ wave 3 complete |
| **4 · reach** | `yargs-compat`, `dev-loop`, `cli-modularity`, `caique`, `docs-deploy`, `cli-benchmarks`, `brand-burgee` | the second host, the dev loop, a CLI we did not write, one brand declaration | 🔨 `burgee/yargs` **804/804** (real yargs: 802 in the same run), byte-identical on the demo (X7, 26 cases), locales shipped, `burgee/yargs/parser` for programs that imported yargs-parser; next: burgee's additions on yargs syntax, then `dev-loop` |
| **5 · speed** | single-binary distribution (`burgee build --binary`), `eslint-plugin-cli-floor` as an oxlint **JS** plugin; native spike only if a Z5-scale measurement reopens it | `--help` in 13 ms, or a recorded decision not to | conditional |
| — | `security-profile` | a scanner-shaped CLI cannot confuse findings with failure | after 3, when an adopter needs it |

### The stack's waves

The engine's waves above stay as they are. The stack runs behind them, one package at a
time, and never publishes a working release before the engine's scoreboard is public.

| Wave | Intents | Ends with |
| :-- | :-- | :-- |
| **S0 · evidence** | `output-stack-research`, `caller-matrix` (the matrix, empty) | every U row cited; the callers named; the measured stack table |
| **S1 · roundel** | `roundel`, `output-stack-compat` (chalk) | policy, tokens, theme; `roundel/chalk` graded; two B4 rows under picocolors and chalk |
| **S2 · flagstaff** | `flagstaff`, `plugin-contract`, `output-stack-compat` (ora, log-update) | the loop, the schema, `check`, the U9 eval green; ora's row |
| **S3 · caique** | `caique`, `output-stack-compat` (inquirer, clack) | prompts that never hang; two rows; the matrix green for five callers |
| **S4 · the rest** | `output-stack-compat` (boxen, cli-table3), `first-adopter` for each package | eight rows; a CLI we did not write on all four |

### Execution graph — what runs in parallel, and where a human signs

Lanes are independent until a join. Every join is a human gate (working agreement rule 3):
the agent that built a lane does not approve it. An agent spawned on a lane reads its
intent, its design, and nothing outside the files those name.

```text
engine  ─ W2 commander-compat ── W3 surfaces (mcp · schema · env · completions) ── W4 reach
             │                                      │
             └── scoreboard PUBLIC ◄── gate ────────┘   ← nothing below publishes before this
                    │
stack   ─ S0 research ──┬── S1 roundel ──── S2 flagstaff ──── S3 caique ──── S4 rest
          caller-matrix │      │  chalk row     │  plugin-contract  │  inquirer · clack rows
          (empty)       │      └── gate         │  ora row          └── gate
                        │                       └── gate
wedge   ─ eslint-plugin-cli-floor (any time after W2; the adoption funnel) ── first-adopter
seen    ─ one public artifact per milestone: scoreboard row → post · ratchet → changelog line ·
          closed upstream issue → comment on that thread with the case · adopter → article
```

- **Parallel:** S0 with W2–W3; the lint wedge with everything; façade vendoring inside a
  wave with that wave's package build.
- **Serial, on purpose:** S1 → S2 → S3, because each depends on the one before (U1), and
  because one scoreboard row at a time is how the numbers stay believable.
- **Re-sequenced 2026-09-08 (owner):** `first-adopter` and
  `eslint-plugin-cli-floor` moved from W4 to run beside W2. They are the only test of whether
  anyone switches, and the wedge is the funnel from the audience the ESLint plugins already
  have. Nothing else moves.
- **The visibility lane** is not optional and has no separate owner: the milestone is not
  done until its artifact is public. The article pipeline and the publish skill already
  exist; this lane is the rule that every green cell produces something a stranger can read.
- **Cadence:** a wave is one calendar month. Kill criteria are evaluated at wave end, never
  mid-wave, so a slow week does not read as a failed bet.
- **Spawning:** one agent per intent per wave, scoped to the intent's `Affected users and
  systems`; a second agent verifies against `Success criteria` before the gate. Neither
  edits the other's tests.

### Risks, and what kills a lane

A roadmap without kill criteria cannot fail honestly. Each row names the number and the
decision it forces.

| Risk | Signal | Decision |
| :-- | :-- | :-- |
| Agents do not actually do better against a burgee CLI | B1 weekly shows no success-rate gain over the incumbent on the same tasks | the agent pitch demotes to "parse reliability" (already the honest justification); `--mcp` stays, the headline changes |
| A façade cannot be lighter than what it replaces | B4 row above the ceiling after two ratchet cycles | the façade is dropped, the layer keeps its native API; the row stays on the page as a recorded loss |
| Nobody switches | no external adopter within one wave of the scoreboard going public | the roadmap pauses at the current wave; the next investment is the wedge and articles, not a package |
| The plugin contract cannot serve four layers | a key that one layer needs breaks another's validation | the contract splits by layer, recorded as a reversal of `plugin-contract`; the shared `check` command survives |
| The stack pulls the repo's credibility before the engine has it | any stack package publishes a working release before the commander row is public | it is a lock (`cli-output-stack` design R-order), not a risk; CI refuses the publish |
| Maintenance is a promise, not a number | no published band for it | two bands, published like the pass rate: **time from an upstream release to its suite re-vendored** (target ≤ 7 days, the watch and the weekly PR already produce it) and **time from an accepted issue to its closed conformance case** (target ≤ 14 days). Both ratchet; breaching either writes an intent |
| An incumbent ships the same thing | commander gains a manifest, or clack a non-TTY error path | the compat row still holds, the edge row above is re-written honestly, and the family's edge (zero deps, one contract) is what remains — which is why the family row leads |

### Native — the fastest language wins, as long as the user never notices

**Decision 2026-09-08, after the review in
[`research/native-when-it-pays.md`](../research/native-when-it-pays.md): no package layer
moves to Rust or Go now.** The parser is at its runtime's floor, the colour and render
layers would cross the JS–native boundary per string and per frame, and an addon's load
cost exceeds the work any layer does in one run. Wave 5 becomes single-binary distribution
of a *user's* CLI (language-free, removes the 30 ms and the Node install) plus the lint
wedge as an oxlint JavaScript plugin. The rule below stays on the books for the one case
that can reopen it: a Z5-scale measurement (hundreds of commands) where the manifest or help
renderer becomes the user's number.

Decided 2026-09-08 (owner): **JS/TS is the gate to the world and stays the surface our
users touch; behind it, whatever makes a layer faster is promoted, in any language,
provided a Node user on CJS or ESM works exactly as before.** The user notices latency,
never language. JavaScript has no seat reserved underneath the surface. The rule is about the user's experience, and the ecosystem has already set the
bar for "smooth":

1. **Ship it the way oxc, rolldown, swc, biome and esbuild ship.** Rust through napi-rs
   (or Go, as esbuild does) with one prebuilt package per platform published from this repo
   as `optionalDependencies` — same-repo, so U6 holds — no postinstall compile, a WASM
   fallback for platforms without a prebuild, and the same `import`/`require` the user
   already writes. Those five tools prove users accept this without noticing the language.
2. **Measure first, and measure the user's number.** A port is justified by a B2 or B4 row
   moving for a user, not by a benchmark of the function alone. Today: bare Node 30 ms,
   `util.parseArgs` +2, burgee +5, commander +16, yargs +84. The parser is at its runtime's
   floor; the render and colour layers are microseconds. The measured candidates are the
   manifest for very large CLIs (Z5), the help renderer at hundreds of commands, the lint
   rule as an oxlint JS plugin (oxlint ships no third-party native rules — the host is native,
   the rule stays JavaScript), the private oracle and bench harness, and width/table maths at
   scale.
3. **Graded by the same suites.** The vendored incumbent tests, the conformance cases, the
   caller matrix and the B rows run against the native build exactly as against the JS one.
   Faster and less compatible is a regression, and CI says so.
4. **In-process for libraries, a binary for tools.** A colour function or a parser must be
   in-process (napi-rs), never a spawned child; a bundler-shaped tool may be a binary. The
   choice between Rust and Go follows from this, not from preference.
5. **The largest speed win is language-independent and comes first:** single-binary
   distribution of a *user's* CLI — `burgee build --binary` via Node's single-executable
   application or an equivalent — removes the 30 ms and the Node install for their users.

6. **Other ecosystems stay reachable, not planned.** An engine behind a thin JS/TS
   surface can carry a thin Python surface later — the incumbents there are click, typer,
   argparse and rich, and the same play (compat graded by their suites, agent-native
   surfaces, zero deps) would apply. Recorded so no design today closes that door; equally
   recorded that no decision today is made for a Python user at a JS/TS user's expense.

7. **What the people who did it concluded** — reviewed with sources in
   [`research/native-when-it-pays.md`](../research/native-when-it-pays.md): native pays for
   CPU-bound work at volume in a short-lived process (esbuild); the larger win was doing the
   work once across tools, not the language (VoidZero); the JS–native boundary is the cost,
   crossed rarely and after a native-side filter (Rolldown, "up to 50% slower" even Rust to
   Rust across a plugin boundary); the plugin API stays JavaScript (Vite); and native size is
   paid by every install, which is why Vite refused a 5 MB addon for one framework. Three
   sharpenings follow: measure the addon's *load* cost against the work saved; native lives
   behind its own opt-in, size-ratcheted package; never cross the boundary per token or per
   frame. Today's verdicts per layer are in that document.

Wave 5 becomes the first port, chosen by the measurement in (2), shipped per (1), graded
per (3). The recorded alternative, "no port", requires the numbers to say JavaScript is not
the friction — which today they do, and which a 250-command CLI may change.

### Wave 1 — what landed, what is left

| | Done | Left |
| :-- | :-- | :-- |
| `compat-oracle` | every file of both suites vendored (internals reported separately); both gates proven (1361/1361, 802/804); `burgee/commander` 1361/1361 and `burgee/yargs` 804/804 — both façades at 100% of their hosts' own suites (2026-09-08); skipped tests reported and never counted; the vendored root is a package a CJS fixture can `require('../')`; `COMPAT_TAP_DIR` keeps the raw TAP; ratchet; `--control`; suites pinned to the hosts' npm releases (commander 15.0.0, yargs 18.1.0) with a fingerprinted compatibility record; daily release watch opens an issue with the exact test/surface diff, weekly re-vendor PR carries it (C6, R4); ratchet on every PR + Node×OS matrix (C3); generated `compatibility.mdx` (C2) | publish the page (needs `docs-deploy`) |
| `cli-packaging` | no-deps / ESM / no-`main` / `default`-condition lock (R1–R3); artifact gate in `release.yml` between build and publish (R4); tarball size ratchet with baseline (R5); provenance restored under the trusted publisher | — (R6 bun/deno smoke landed in wave 2: `runtime-smoke.yml`) |
| **ESM + CJS** | every entry has a `default` condition; no top-level await in the library; `require('burgee')` and `require('burgee/commander')` proven against the installed tarball — one artifact, both module systems (K2, revised) | — |
| `replacement-parser` | engine, lifecycle, exit contract, manifest, four locks; `defineProgram`; `--` pass-through and `-` (G5); seven cited §10 fixes (G6); G7 measured at +5 ms, level with bare `parseArgs`; `demo-cli-burgee` as the third conformance host via `runBurgee` (G2), with the envelope difference declared per host; `ctx.exit`, env binding, root/group help | G3 quirks — they land with the front-ends in wave 2 |

### What the research changed, and where it landed

The three research documents added 13 requirements and moved one intent.

- **`cli-help-renderer` promoted to wave 2.** Help rendering is the largest cluster in the
  trackers *and* the single most-requested open item in either project — yargs #684,
  49 engagement, open ten years. It also gains N15, the agent output format oxlint and
  vitest converged on independently: one compact line per record, deliberately not JSON.
- **`cli-mcp` carries four new requirements** — N6 required `effects` (the MCP schema
  defaults `destructiveHint` to true, so silence is the dangerous reading), N8 schema
  without auth or network, N11 vercel's action-required envelope with runnable `next[]`,
  N13 token-budget-aware schema.
- **`commander-env` gains N12** — agent detection beyond `isTTY`, since an agent may well
  have one — **and V8**, a generated precedence table: ten of ten CLIs surveyed have config
  and env, three document the order.
- **`commander-schema` gains N9 and N14** — `enum`/`min`/`max` as data rather than
  completion callbacks (the flag/schema gap, Cobra #2362), and gh-style field discovery.
- **E6/E7 go to the engine** — usage vs environment vs remote as distinct codes, and a
  declarative taxonomy where reusing a code fails at startup, because oxlint collapses a
  20-variant enum to `{0,1}`.
- **`cli-benchmarks` B1 is now a hypothesis, not a target.** JetBrains' 425-trial study
  found output filtering *raised* cost 7.6%. O2/O5/F1 are justified by parse reliability.
- **Plugins are repositioned from headline to compounding advantage.** commander's own
  plugin RFC has 1 comment and 0 reactions in five months; there is no tracker demand.
  `--schema` is the pitch — six issues over nine years and a regex-scraper as the state of
  the art. `cli-modularity` stays scheduled on architectural merit and says so.

`commander-agent` and `yargs-agent` remain **superseded**: with the engine as the product,
a layer over someone else's parser and a compatible front-end over ours are the same
package.

### Status drift, stated

Two things the artifacts say that are not quite true, so nobody reads them as true:

- **Every buildable intent still reads `review`.** Per `AI_NATIVE_SDLC.md` rule 3,
  `approved` is the human gate — and the engine, the oracle and the façade were built
  through it. Either wave 1's intents move to `approved` retroactively, or the gate is
  acknowledged as advisory in practice. The plan does not pretend otherwise.
- **`replacement-parser` is largely built and says `review`.** Same fix.

### The one risk that matters

A layer earns users while it is being built. **A replacement earns none until it works.**
That is the cost of this decision and it is real.

The mitigations, both live:

- **The burn-down is public from the first commit.** It is `1361 / 1361` and `804 / 804` today — commander's and yargs' own suites, in full. A number
  that only goes up is more persuasive than any announcement, and it makes the wait
  visible instead of silent.
- **`eslint-plugin-cli-floor` needs no runtime adoption at all** — no dependency in
  anyone's shipped bundle, no migration — so it can earn users during the whole build. It
  moves earlier than wave 4 if wave 1 finishes ahead of it.

### Architecture decisions

Recorded in [`architecture-review.md`](../research/architecture-review.md).

**The layer is TypeScript; the replacement may have a native front-end.** These are
different products with different profiles, and conflating them is the mistake to avoid.
A layer is imported into someone's existing Node CLI — it cannot be a binary, and the
process has already paid Node's 29ms before our code runs, so a faster language buys
nothing. A replacement owns the process from argv, so it can answer `--help` and
`--schema` natively and never start Node at all. TS7 chose Go, oxlint and rolldown chose
Rust; all three own their process and do bulk work, which is the profile that pays.

**Plugins are data plus lazily-loaded behaviour, not a function that mutates the tree.**
A build-time manifest declares every command a plugin contributes; at run time one JSON
is read, one command resolved, one handler imported. `--help` and `--schema` are complete
without loading any plugin, so a 250-command CLI starts as fast as a one-command CLI.
This is rolldown's filter-before-you-cross applied to module loading, plus oclif's
build-time manifest — **and it is the same decision that makes a native front-end
possible at all**, because a native binary can read a static manifest and cannot execute
a JS plugin registration function.

**Why the oracle moved to wave 1.** It was not in the original plan. Vendoring
commander's suite and pointing it at a shim took ten minutes to prove and turns
compatibility from an adjective into a burn-down; every intent after it inherits a
working acceptance gate written by the competitor.

## The two metrics that decide whether this worked

### Compatibility

Not a promise, a published rate. `compat-oracle` runs each host's own suite against
whatever a one-line shim points at, and the rate ratchets.

| Metric | Source | Baseline |
| :-- | :-- | :-- |
| `compat-commander-pass-rate` | commander's 1,215 public-surface tests | 1,210/1,215 against real commander, measured 2026-09-06 |
| `compat-yargs-pass-rate` | yargs' 804 tests | 804 / 804 (2026-09-08) |
| `node-matrix-green` | every Node LTS in `engines` × Linux, macOS, Windows | Node 24 and 26 today |
| documented divergences | `excluded.json`, rendered on the docs site | 9 upstream files testing internals, excluded and named |

An unlisted failure is a bug. A listed one is a documented difference with a reason and
a test. That distinction is the whole difference between a compatibility claim and a
compatibility number.

### Benchmarks

One suite, four axes, one JSON shape, all on the docs site.

| Axis | Metric | Target |
| :-- | :-- | :-- |
| B1 agent cost | tokens and turns per task, layer on vs off | ≥40% fewer tokens, ≥30% fewer turns — or the claim gets rewritten with the measured number |
| B2 performance | cold start p50/p95, ≥30 spawns, bare-node floor row mandatory | the layer's overhead over its own host; the replacement at or below cac |
| B3 compatibility | per-host pass rate, read from the oracle | ratchets, never recomputed |
| B4 weight | bundled KB per entry point | core under cac's 52KB; core + one front-end under the host it replaces (commander 232KB, yargs 376KB); core-only import pulls zero front-end bytes |

Reference numbers, all measured 2026-09-06 and recorded in the competitor map: bare node
29ms, `node:util.parseArgs` +2ms, cac +5ms, citty +6ms, commander +16ms, meow +52ms,
yargs +84ms.

## Package naming

Decided 2026-09-06 after checking **155 candidates**. The finding is structural: **npm's
unscoped single-word namespace is exhausted.** Almost every meaningful English word,
military rank, Latin or Greek term, CLI term and agent-era word is held, mostly by
squatters and dead packages — `admiral`, `commodore`, `adjutant`, `shebang`, `synopsis`,
`stdio`, `argv`, `edict`, `dictum`, `prism`, `herald`, and `interlace` itself.

| Family checked | Tried | Free |
| :-- | --: | --: |
| military rank, one above *commander* | 20 | 0 |
| command words | 22 | 2 |
| CLI and agent vocabulary | 22 | 6 |
| Latin and Greek | 24 | 3 |
| weaving terms, for a brand tie | 15 | 3 |
| coined and compound | 52 | 15 |

That leaves the two strategies every modern tool used once the words ran out: a
**compound** (rolldown, esbuild, turbopack) or a **coined word** (vite, deno, zod, hono,
oclif). Scoped names are ruled out by the owner.

### The name: `burgee`

A **burgee** is the small flag a boat flies to say which club or fleet it belongs to. It
is not a signal and not a warning — it is the flag you fly to **declare what you are**.

That is the product in one word, and every layer of it is load-bearing:

- **It is a flag.** Flags are the literal subject matter of a command-line interface, and
  every surface in `architecture.md` §1 — help, `--json`, `--schema`, `--mcp`,
  completions, types — is the same declared set of flags read by a different reader.
- **It is a flag of identity, not of instruction.** A CLI on burgee declares itself once;
  callers read that declaration. That is precisely the argument for a well-formed CLI over
  a bespoke MCP server.
- **It is nautical**, so it lives in yargs' register without being a pirate pun that has to
  be explained, and it sits naturally beside commander's.
- **It is timeless.** A centuries-old maritime term cannot date the way `agentic` would.
  Whatever replaces the word "agent", boats will still fly burgees and CLIs will still
  have flags.
- **It stands alone.** Like Claude to Anthropic, it names the product without describing
  it — and rewards you once you learn why. `npm i burgee` · `burgee dev` ·
  `burgee/commander`, six letters, two syllables, one obvious pronunciation.

**Why not `invocable`**, the other finalist. `invokable` is an equally valid English
spelling of the same word and is **already taken by an unrelated publisher**. A meaningful
share of users would type `npm i invokable` and install a stranger's package, and the
defensive registration that would normally fix this is unavailable because the name is
gone. That risk is permanent and unfixable. `burgee`'s own near-misses, `burgie` and
`burgy`, are both free and will be registered as deprecated stubs pointing at the real
package.

The remaining risk is honest and small: `burgee` sits one letter from `burger` for a
careless typist. It is not a plausible *misspelling* the way `invokable` is — they are
different words — and the stubs plus unambiguous documentation cover it.

Runners-up, recorded and free: **`backus`** — John Backus, of Backus-Naur Form, the
notation for declaring grammars, which is what a CLI is; the best of the person-names in
the Claude register. **`mcilroy`** — Doug McIlroy, who invented the Unix pipe and wrote
*"write programs to handle text streams, because that is a universal interface"*, the
truest description of why this project exists, rejected only because two people in three
will misspell it. **`roundel`** and **`vexillum`**, the other flag words.

### The rest of the family

`@interlace/*` remains for internal packages that are never published —
`compat-oracle`, which is private and unscoped. Everything public is unscoped. After the
2026-09-07 fold there is exactly one public package; the output stack proposes three more,
each **an independent product with its own name, README, benchmarks and competitors** (U12),
named from the same flag-and-rigging register as `burgee` — compounds were rejected because a
prefix says "accessory" — incumbent façades as subpaths never as packages, and **zero external
dependencies** — a stack package may depend only on
another package published from this repo (U1, U6). Everything lives in this one repo, so an
agent working on any layer has the whole stack in context.

| Job | Entry point | Published |
| :-- | :-- | :-- |
| the framework | `burgee` | ✅ 0.1.0 |
| in-process harness (T1) | `burgee/testing` | subpath |
| commander compatibility | `burgee/commander` | wave 2 |
| yargs compatibility | `burgee/yargs` | wave 4 |
| opt-in host quirks | `burgee/quirks/*` | wave 2 |
| the lint wedge | `eslint-plugin-cli-floor` | wave 4 |
| the colours a CLI carries: policy, tokens, theme, chalk path | `roundel` | candidate, `cli-output-stack` |
| the staff the flag flies from: frame loop, plugin host, ora/boxen/cli-table3/log-update paths | `flagstaff` | candidate, `cli-output-stack` |
| the parrot that always answers back: prompts, flags first | `caique` | candidate, `caique` |
| grading + reference drivers | `compat-oracle` | private, never |

Every entry point above must declare a weight rule in `packages/burgee/src/weight.test.ts`
before it can ship — the lock refuses to pass otherwise.

The name is reversible until the first publish, and **wave 1 does not depend on it** —
the engine, the shape lock and the compatibility oracle are all built before anything
reaches npm.

## Execution status

Twenty-four intents: two `shipped`, two `dropped`, one `draft`, nineteen `review`; every open question in every intent has
a recorded decision. Moving an intent to `approved` is the human gate, per
`AI_NATIVE_SDLC.md` rule 3 — nothing is built before that.

Prerequisites only the owner can supply (none are set as of 2026-09-06):

| Item | Needed by |
| :-- | :-- |
| `NPM_TOKEN`, or npm Trusted Publishing per package | wave 1, first publish |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude review now; `cli-benchmarks` B1 in wave 2 |
| `VERCEL_TOKEN`, Vercel project, DNS for `cli.interlace.tools` | wave 2, `docs-deploy` |
| macOS and Windows runners in the matrix | wave 1, C3 and E5 on three platforms |

## Where intents come from

A person, or a control-band breach (intent 1 wires the watcher). Every intent here was
opened from the umbrella design and the 329-issue research in `docs/research/`.
