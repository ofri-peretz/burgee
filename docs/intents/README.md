# `docs/intents/` — Stage 1 (Plan) and Stage 2 (Design)

Every substantive change starts here. See `AI_NATIVE_SDLC.md`, one level above this
repo, for why. Layout and status values are the same as in `eslint/`: one directory per
intent, `intent.md` then `design.md`, statuses `draft → review → approved → shipped`
(or `dropped`), and `approved` requires a `design.md` beside it.

## The roadmap in one paragraph

**Decided 2026-09-06: we are building a competitor to commander and yargs, not a layer on
top of them.** One engine owns argv and the lifecycle. It is drop-in compatible with both
incumbents — `burgee/commander` and `burgee/yargs`, graded by their own 1,215 and
1,185 tests, with the pass rate published and ratcheting from the first commit. And it
serves every command through every format a caller wants — human help, `--json`,
`--schema`, `--mcp`, completions, Fig, types, docs — all projections of one manifest, so
none of them can drift. Compatibility makes it cheap to try; the surfaces are the reason
to switch. Throughout, one constraint outranks every feature: **it stays a library you
import in one file, not a framework you scaffold into.** oclif has all of these
capabilities and does 10.9M/week against commander's 508M.

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
| §9 interactive prompts | `cli-prompts` | 4 |
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
| 8 | [`eslint-plugin-cli-floor/`](./eslint-plugin-cli-floor/) | the L rules; the adoption wedge that needs no runtime change | F3 O1–O4 E1 E2 V2 V5 P1 D1 | review |
| 9 | [`docs-deploy/`](./docs-deploy/) | `apps/docs` on an interlace.tools host, `llms.txt`, the benchmarks page | B7 | review |
| 10 | [`first-adopter/`](./first-adopter/) | a CLI we did not write, using the layer, reviewed by someone who did not build it | A1–A5 | review |
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
| 17 | [`cli-prompts/`](./cli-prompts/) | §9 | flags first, errors in non-TTY, `--yes`, `--interactive` | P1–P3 |
| 18 | [`cli-modularity/`](./cli-modularity/) | §8 | groups, lazy commands, plugins, shared options, deprecation | M1–M6 |

### Reach

| # | Intent | Delivers | Floor ids | Status |
| :-- | :-- | :-- | :-- | :-- |
| 19 | [`replacement-parser/`](./replacement-parser/) | our parser over `node:util.parseArgs`, as a third conformance host | G1–G7, §10 fixes | review |
| 20 | [`commander-compat/`](./commander-compat/) | `burgee/commander` — commander 15 ported method for method, graded by commander's 1,331 tests; 1,327 pass (parity with the real package) | X1–X8 | review |
| 21 | [`yargs-compat/`](./yargs-compat/) | `burgee/yargs` — 108 methods, graded by yargs' 1,185 tests | X1–X7 | review |

Not planned, on purpose: an update checker (citty #10 — a network call at startup is the
opposite of what an agent wants), and non-Node runtimes (claiming Deno and Bun means
testing them, which is its own intent with its own matrix).

## Waves

Re-planned 2026-09-07 after the research pass. Wave 1 ends with something installable and
a **live scoreboard**; every wave after it ends with that number higher.

### Scoreboard

```text
                       burgee                              control (the real host)
compat-commander    ████████████████████████  1327 / 1331   99.7%     ████████████████████████  1327 / 1331   99.7%
  internals                                         12 /   12                                          12 /   12
compat-yargs        ░░░░░░░░░░░░░░░░░░░░░░░░     0 /  804    0.0%     ███████████████████████░   783 /  804   97.4%
  internals                                          0 /   23                                          23 /   23
```

Every file of both suites is vendored and run — nothing is excluded. The *internals* lines
are the files that import only the host's own modules (`../lib/command.js`); they are
reported, never gated: passing them would mean copying the host's file layout.

`npm run compat` — each host's own suite, vendored (commander `ba6d13dd`, yargs
`fb9c0559`) and graded through generated shims; `--control` grades each against its real
package first, which proves the gate before it grades anything of ours. The denominator is
the reference total, not the tests that happened to register, so a partial implementation
cannot flatter itself. `burgee/yargs` reads an honest 0 until wave 4 builds it and does not
fail CI; falling below a recorded baseline does (C5). A suite killed mid-run by a test
calling `process.exit()` is reported as an error, never as a score — it read as "0 / 0"
three separate times before that rule existed.

| Wave | Intents | Ends with | Status |
| :-- | :-- | :-- | :-- |
| 0 | `sdlc-locks-evals-bands`, `cli-testing-harness` | the loop, and a harness that runs a CLI in-process | ✅ shipped |
| **1 · engine** | `replacement-parser`, `compat-oracle`, `cli-packaging` | a one-file CLI that runs, the shape lock green, the first published pass rate | 🔨 engine built · oracle grading commander · packaging next |
| **2 · compatibility** | `commander-compat`, `cli-help-renderer` ↑ | every upstream file graded; `burgee/commander` 1,327/1,331 (= real commander in the same run) and byte-identical to commander on the demo (X7, 29 cases); help rendered from the manifest with `help <cmd>`, groups, examples, env, width from the runtime (H1–H6) | in progress |
| **3 · surfaces** | `cli-mcp`, `commander-schema`, `commander-env`, `commander-completions` | `--schema`, `--mcp`, completions — the reason to switch | 🔨 `--schema`, `--mcp` and static completions for bash/zsh/fish/pwsh + Fig served from the manifest on every program, commander syntax included (N1–N6, N8, N9, D2–D5); one precedence order with `--explain`, `meta.provenance`, config discovery with `extends`, `--version` from the owning package.json (V1–V7); options declared once — inferred types, numbers, `multiple`, choices enforced, relations, Standard Schema, kebab on the CLI (S1–S8); `changed`, the action-required envelope, agent detection, the schema budget (N7, N11–N13) — ✅ wave 3 complete |
| **4 · reach** | `yargs-compat`, `dev-loop`, `cli-modularity`, `cli-prompts`, `first-adopter`, `eslint-plugin-cli-floor`, `docs-deploy`, `cli-benchmarks`, `brand-burgee` | the second host, the dev loop, a CLI we did not write, one brand declaration | queued |
| **5 · speed** | native front-end spike, `eslint-plugin-cli-floor` as an oxlint rule | `--help` in 13 ms, or a recorded decision not to | conditional |
| — | `security-profile` | a scanner-shaped CLI cannot confuse findings with failure | after 3, when an adopter needs it |

### Wave 1 — what landed, what is left

| | Done | Left |
| :-- | :-- | :-- |
| `compat-oracle` | every file of both suites vendored (internals reported separately); both gates proven (1327/1331, 783/804); `burgee/commander` 1327/1331 — parity with real commander in the same run, `burgee/yargs` an honest 0/804; ratchet; `--control`; suites pinned to the hosts' npm releases (commander 15.0.0, yargs 18.1.0) with a fingerprinted compatibility record; daily release watch opens an issue with the exact test/surface diff, weekly re-vendor PR carries it (C6, R4); ratchet on every PR + Node×OS matrix (C3); generated `compatibility.mdx` (C2) | publish the page (needs `docs-deploy`) |
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

- **The burn-down is public from the first commit.** It is `1327 / 1331` today — the same 1,327 real commander scores in the same environment. A number
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
| `compat-yargs-pass-rate` | yargs' 1,185 tests | recorded when wave 1 vendors the suite |
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
will misspell it. **`pennon`** and **`vexillum`**, the other flag words.

### The rest of the family

`@interlace/*` remains for internal packages that are never published —
`compat-oracle`, which is private and unscoped. Everything public is unscoped, and
after the 2026-09-07 fold there is exactly one public package.

| Job | Entry point | Published |
| :-- | :-- | :-- |
| the framework | `burgee` | ✅ 0.1.0 |
| in-process harness (T1) | `burgee/testing` | subpath |
| commander compatibility | `burgee/commander` | wave 2 |
| yargs compatibility | `burgee/yargs` | wave 4 |
| opt-in host quirks | `burgee/quirks/*` | wave 2 |
| the lint wedge | `eslint-plugin-cli-floor` | wave 4 |
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
