# `docs/intents/` — Stage 1 (Plan) and Stage 2 (Design)

Every substantive change starts here. See `AI_NATIVE_SDLC.md`, one level above this
repo, for why. Layout and status values are the same as in `eslint/`: one directory per
intent, `intent.md` then `design.md`, statuses `draft → review → approved → shipped`
(or `dropped`), and `approved` requires a `design.md` beside it.

## The roadmap in one paragraph

**Decided 2026-09-06: we are building a competitor to commander and yargs, not a layer on
top of them.** One engine owns argv and the lifecycle. It is drop-in compatible with both
incumbents — `interlace/commander` and `interlace/yargs`, graded by their own 1,215 and
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

§10 was previously marked *not planned, commander owns it*. Owning a parser (wave 5)
converts it from a permanent dependency into a fixable backlog, so it now has an owner.
§12 stays partly an article rather than a package; that is deliberate.

## The intents

### Foundation — the loop and the gates

| # | Intent | Delivers | Floor ids | Status |
| :-- | :-- | :-- | :-- | :-- |
| 1 | [`sdlc-locks-evals-bands/`](./sdlc-locks-evals-bands/) | intent lock, evals layer 1, control bands | — | shipped |
| 2 | [`cli-testing-harness/`](./cli-testing-harness/) | `Runtime` seam; `commander-harness`, `yargs-harness`; the conformance suite | T1 | shipped |
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
| 12 | [`dev-loop/`](./dev-loop/) | `interlace dev` — watch, reload, and serve live MCP so your agent sees a command as you write it | W1–W6 | review |

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
| 20 | [`commander-compat/`](./commander-compat/) | `selvage/commander` — 151 methods, graded by commander's 1,215 tests | X1–X7 | review |
| 21 | [`yargs-compat/`](./yargs-compat/) | `selvage/yargs` — 108 methods, graded by yargs' 1,185 tests | X1–X7 | review |

Not planned, on purpose: an update checker (citty #10 — a network call at startup is the
opposite of what an agent wants), and non-Node runtimes (claiming Deno and Bun means
testing them, which is its own intent with its own matrix).

## Waves

Restructured 2026-09-06 for the competitor decision. Wave 1 ends with something
installable; every wave after it ends with a higher public compatibility number.

| Wave | Intents | Ends with |
| :-- | :-- | :-- |
| 0 ✅ | `sdlc-locks-evals-bands`, `cli-testing-harness` | the loop, and a harness that runs a CLI in-process |
| **1 · engine** | `replacement-parser`, `compat-oracle`, `cli-packaging` | a one-file CLI that runs, the shape lock green, and the first published commander pass rate |
| **2 · compatibility** | `commander-compat`, `cli-help-renderer` | `interlace/commander` installable, its rate burning down in public |
| **3 · surfaces** | `cli-mcp`, `commander-schema`, `commander-env`, `commander-completions` | `--schema`, `--mcp`, completions — the reason to switch |
| **4 · reach** | `yargs-compat`, `dev-loop`, `cli-modularity`, `cli-prompts`, `first-adopter`, `eslint-plugin-cli-floor`, `docs-deploy`, `cli-benchmarks` | the second host, the dev loop, and a CLI we did not write using it |
| **5 · speed** | native front-end spike, `eslint-plugin-cli-floor` as an oxlint rule | `--help` in 13ms, or a recorded decision not to |

`commander-agent` and `yargs-agent` are **superseded**: with the engine as the product,
a layer over someone else's parser and a compatible front-end over ours are the same
package, and the front-end is the one that needs no host dependency. Their requirements
(F, O, E, M) move to the engine and the compat front-ends.

### The one risk that matters

A layer earns users while it is being built. **A replacement earns none until it works.**
That is the cost of this decision and it is real.

The mitigations, both starting in wave 1:

- **The burn-down is published from the first commit.** `compat-commander 1,050/1,215 ▲+38
  this week` is more persuasive than any announcement, and it makes the wait visible
  instead of silent.
- **`eslint-plugin-cli-floor` needs no runtime adoption at all** — no dependency in
  anyone's shipped bundle, no migration — so it can earn users during the whole build.
  It moves as early as wave 4 will allow, and earlier if wave 1 finishes ahead of it.

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

Public packages are host-branded extensions, on the `eslint-plugin-*` model — never
`@interlace/*`. Verified free on npm 2026-09-06 unless noted.

| Job | commander | yargs |
| :-- | :-- | :-- |
| the floor | `commander-agent` | `yargs-agent` |
| in-process harness | `commander-harness` | `yargs-harness` |
| schema declaration | `commander-schema` | name decided in wave 3 (`yargs-schema` is taken by an unrelated package) |
| env and precedence | `commander-env` | `yargs-env` |
| completions | `commander-completions` | `yargs-completions` |
| prompts | `commander-prompts` | `yargs-prompts` |
| modularity | `commander-plugins` | `yargs-plugins` |
| the lint wedge | `eslint-plugin-cli-floor` | same package |
| the replacement | `selvage` + `selvage/commander` | `selvage/yargs` |

`@interlace/*` is used only for internal packages that are never published:
`@interlace/cli-core`, `@interlace/compat-oracle`. Help rendering has no package of its
own — it is part of `commander-agent`, because "help is data rendered from the manifest"
is the same contract, not a separate product. `selvage` is provisional; `treadle` and
`sley` are also held.

## Execution status

All twenty-one intents are `review` or `shipped`; every open question in every intent has
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
