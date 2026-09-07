# Architecture

The product in diagrams. Prose only where a diagram cannot carry it.

Decided 2026-09-06: we are building a **CLI framework that replaces commander and
yargs**, is drop-in compatible with both, and serves every command through every format
a caller might want. Not a layer on top of them.

## 1. The thesis: one declaration, every surface

```mermaid
flowchart LR
  D["defineCommand()<br/><i>written once</i>"] --> M[["manifest<br/>(in memory by default)"]]
  M --> H["human help"]
  M --> J["--json envelope"]
  M --> S["--schema<br/>versioned + JSON Schema"]
  M --> P["--mcp<br/>MCP server"]
  M --> C["completions<br/>bash zsh fish pwsh"]
  M --> F["Fig spec"]
  M --> T["TypeScript types"]
  M --> L["docs + llms.txt"]
  M --> N["lint rules"]
```

Every surface is a **projection of the same manifest**. They cannot drift, because there
is nothing to keep in sync. Adding a tenth surface is a new emitter, not a new feature.

This is the reason to switch. Compatibility is only the reason it is cheap to try.

## 2. The shape lock: a better commander, not another oclif

oclif has every capability below and does **10.9M/week against commander's 508M**. The
difference is shape, not features: oclif is a framework you scaffold into, commander is a
library you import.

```
         commander                  us                        oclif
         ─────────                  ──                        ─────
day 1    npm i commander            npm i interlace           npx oclif generate
         write 1 file               write 1 file              ~40 files, a build step
         node cli.js                node cli.js               18 runtime deps
                                        │
                                        │  opt in, only if you need it
                                        ▼
                                    burgee manifest   (250-command CLIs)
                                    burgee dev        (watch + live MCP)
                                    plugins              (multi-package CLIs)
                                    interlace init       (scaffold, if you want one)
```

**Z1 is a test, not a principle.** `shape.test.ts` makes a temp directory, installs the
tarball, writes **one file**, runs it, asserts the output. If it ever needs a second file,
a config, or a build step, we have become oclif and CI goes red.

Progressive disclosure, stated as a ladder:

```mermaid
flowchart TD
  A["one file, npm i, no build<br/><b>the default — 95% of CLIs</b>"] --> B["+ plugins<br/>multi-package CLI"]
  B --> C["+ precomputed manifest<br/>250-command CLI, lazy loading"]
  C --> D["+ native front-end<br/>13ms --help, never boots Node"]
  A -.-> E["interlace dev<br/>watch + live MCP<br/><i>orthogonal, dev-time only</i>"]
```

Each rung is additive and removable. Delete any of them and rung one still works.

## 3. Engine and front-ends

```mermaid
flowchart TB
  subgraph core["@interlace/core — the engine (TypeScript, zero deps)"]
    PA["node:util.parseArgs<br/>tokenise only"] --> RES["resolve<br/>subcommands, positionals, --"]
    RES --> VAL["schema · relations · coercion"]
    VAL --> PREC["precedence<br/>flags &gt; env &gt; config &gt; default<br/>+ provenance"]
    PREC --> LIFE["lifecycle<br/>parse→load→validate→run→render→exit"]
    LIFE --> OUT["output<br/>envelope · exit codes · no help on runtime error"]
    MAN[["manifest"]]
  end

  subgraph fe["front-ends — pay per import"]
    NAT["interlace<br/><i>native API</i>"]
    CMD["burgee/commander<br/>151 methods · 1,215 tests"]
    YRG["burgee/yargs<br/>108 methods · 1,185 tests"]
  end

  subgraph q["quirks — opt-in, shared"]
    Q1["camelCase"]; Q2["-abc bundling"]; Q3["--no- negation"]; Q4["dot-notation"]; Q5["array accumulate"]
  end

  NAT --> core
  CMD --> core
  YRG --> core
  CMD -.-> q
  YRG -.-> q
  core --> MAN
```

The two hosts disagree observably, so one parser cannot be bug-compatible with both.
**Two front-ends over one engine** is the only shape that works — and the quirks they
need are shared modules, not duplicated code.

`import { defineCommand } from 'interlace'` pulls **zero bytes** of either front-end.
Asserted by benchmark axis B4, not by intention.

## 4. Migration: one import line

```diff
- import { Command } from 'commander';
+ import { Command } from 'burgee/commander';
```

```mermaid
flowchart LR
  U["your existing CLI"] --> SW["change 1 import"]
  SW --> R["your tests still pass<br/><i>graded by commander's own 1,215</i>"]
  R --> G["you now have<br/>--json · --schema · --mcp · completions<br/>exit-code contract · no help on runtime error"]
```

The claim is never the word "compatible". It is a **published pass rate**, ratcheting, in
CI on every PR:

```
compat-commander  ████████████████████░░░░  1,050 / 1,215   (86.4%)   ▲ +38 this week
compat-yargs      ██████████░░░░░░░░░░░░░░    480 / 1,185   (40.5%)   ▲ +52 this week
```

That burn-down is also the marketing. A number going up in public is more persuasive than
any announcement, and it is the honest version of "100%".

## 5. The adoption ladder

Someone on commander or yargs keeps the syntax they know, gains burgee's capabilities on
day one, and adopts native syntax at their own pace — three rungs, and a program may
stand on more than one at once.

```mermaid
flowchart TB
  R1["<b>rung 1 · keep your syntax</b><br/>import { Command } from 'burgee/commander'<br/><i>your code and your tests unchanged</i>"]
  R2["<b>rung 2 · capabilities, free</b><br/>--json · --schema · --mcp · completions<br/><i>no code change: they are projections<br/>of the manifest the façade already fills</i>"]
  R3["<b>rung 3 · one explicit line</b><br/>exit-code contract · no help on runtime error<br/><i>opt-in, because these change behaviour<br/>the host's own tests assert</i>"]
  R4["<b>rung 4 · native syntax</b><br/>defineCommand, mixed freely<br/><i>command by command, same program</i>"]
  R1 --> R2 --> R3 --> R4
```

**Why the surfaces come free.** `burgee/commander` is a *façade over burgee's engine*, not
a wrapper around real commander. A command declared through commander's API lands in the
same manifest as a native `defineCommand`, and every surface in §1 is a projection of that
manifest — the surfaces never learn which façade filled it.

```mermaid
flowchart LR
  A["commander syntax<br/>new Command()"] --> M[["one manifest"]]
  B["yargs syntax<br/>yargs().command()"] --> M
  C["native syntax<br/>defineCommand()"] --> M
  P["any plugin<br/>definePlugin()"] --> M
  M --> S["help · --json · --schema<br/>--mcp · completions · types"]
```

**And plugins ride the same road.** A plugin contributes *to the manifest*, and the
manifest does not record which façade filled it — so one plugin works identically on a
commander-syntax program, a yargs-syntax program and a native one. That matters more than
it first appears: **commander has no plugin system at all** (its RFC, #2505, is still
unlanded after years) and yargs has none either. So a commander user who changes one
import does not merely gain `--json`; they gain a plugin ecosystem their own framework
never had, without touching a line of their code — and any plugin they write is portable
to every other rung of the ladder.

**Why rung 3 is opt-in and not free.** commander's own 1,215 tests assert its help text and
its exit behaviour. A front-end that changed those by default would fail the very suite the
compatibility claim rests on — and would break real users silently. So the free tier is
strictly *additive*: `--json`, `--schema` and `--mcp` are new flags that collide with
nothing, while the behavioural floor is one line away rather than zero. Still far shorter
than a rewrite.

If a program already defines a name burgee reserves, **the program wins** and burgee
withholds that surface, reporting it in `--schema` rather than silently shadowing it.

## 6. The local feedback loop

```mermaid
sequenceDiagram
  participant Dev as you
  participant Watch as interlace dev
  participant CLI as your CLI
  participant Agent as your agent

  Dev->>Watch: interlace dev
  Watch->>CLI: load, compute manifest in memory
  Watch->>Agent: MCP server on stdio, tools = your commands
  Dev->>Watch: edit a command
  Watch->>CLI: reload
  Watch->>Agent: tools/list_changed
  Agent->>CLI: calls the new command immediately
  Note over Dev,Agent: no rebuild, no restart, no reconfiguration
```

Your agent is connected to your CLI **while you are writing it**. Change a flag and the
agent sees it on the next call. This is dev-time only and entirely optional — rung one of
the ladder never starts a server.

## 7. Where a faster language pays, and where it does not

```mermaid
flowchart TB
  subgraph slow["native does NOT pay — imported into someone's Node process"]
    L1["a layer/library"] --> L2["Node already started: 29ms spent"] --> L3["ceiling on the win = 16ms<br/>NAPI dlopen, 8+ prebuilds, breaks bundling"]
  end
  subgraph fast["native DOES pay — owns the process from argv"]
    N1["a replacement"] --> N2["reads the static manifest"] --> N3["--help --schema completions usage-error<br/><b>~13ms, never boots Node</b>"]
    N3 --> N4["running a handler → hand off to Node<br/>~42ms vs 50ms today"]
  end
```

| Path | Node + commander today | native front-end |
| :--- | ---: | ---: |
| `--help`, `--schema`, completions, usage error | 50ms | **~13ms** |
| running a handler | 50ms | ~42ms |

Discovery is most of what an agent does before it does anything, so this is ~4× on the
traffic that matters. It is also **structurally impossible for a layer** — a layer is
imported into a process that already booted.

The taxonomy behind the rule:

| Tool | Language | Owns process? | Work per run |
| :--- | :--- | :--- | :--- |
| TypeScript 7 / tsgo | **Go** | yes | thousands of files |
| oxlint | Rust | yes | thousands of files |
| rolldown | Rust | yes (NAPI) | thousands of modules |
| vite | **TypeScript** | yes | *orchestrates the natives* |
| commander / yargs | **TypeScript** | **no — your CLI does** | ~5 argv tokens |

**Go, not Rust**, if we do it: TS7 chose Go because it allowed a near line-by-line port
preserving identical behaviour. Our binding constraint is the same kind — fidelity against
2,304 tests, not raw speed.

Gated on a spike, and the engine stays TypeScript either way. The native front-end is
rung four of the ladder: additive, removable, and it reads the same manifest.

## 8. Build order

```mermaid
flowchart LR
  W1["<b>1 · engine</b><br/>parseArgs core<br/>lifecycle · exit codes<br/>shape lock<br/>compat-oracle"] --> W2["<b>2 · compatibility</b><br/>burgee/commander<br/>burn 1,215 down<br/>publish the rate"]
  W2 --> W3["<b>3 · surfaces</b><br/>--schema · --mcp<br/>help renderer<br/>completions"]
  W3 --> W4["<b>4 · reach</b><br/>burgee/yargs<br/>interlace dev<br/>plugins · first adopter"]
  W4 --> W5["<b>5 · speed</b><br/>native front-end spike<br/>lint rule as oxlint rule"]
```

Wave 1 ends with something installable. Every wave after it ends with a higher public
compatibility number.

## 9. What could still kill this

Recorded so it is not discovered late.

```mermaid
flowchart TD
  R1["no adoption until compat is real"] --> M1["mitigate: publish the burn-down from<br/>commit one; ship eslint-plugin-cli-floor<br/>early — it needs no runtime change"]
  R2["we drift into oclif's shape"] --> M2["mitigate: Z1 shape test is CI-enforced"]
  R3["compat is a treadmill"] --> M3["mitigate: scheduled vendor refresh opens a PR<br/>when upstream's test count moves"]
  R4["four surfaces, one maintainer"] --> M4["mitigate: no new front-end until the<br/>previous one's conformance cases are green"]
```

The honest one is R1. A layer earns users while it is being built; a replacement earns
none until it works. The burn-down is the only thing that makes the wait visible.
