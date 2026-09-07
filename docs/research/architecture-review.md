# Architecture review, 2026-09-06

An honest read of the plan before wave 1 starts, covering three questions: what is
wrong with it, how JS plugin extensibility should work, and whether the engine could be
Rust or Go.

## 1. What is wrong with the plan

Nine findings, worst first. Five have actions in this document; four are flagged for a
decision.

### 1.1 The planning-to-shipping ratio is the biggest risk in the project

Twenty planning documents, sixty-nine requirements, eighteen intents, six waves — and
**zero published packages**. Two internal packages exist. Nothing is installable.

This is the same failure mode as the thing we keep citing: stricli is beautifully
designed and does 16 downloads a week. A roadmap has never been adopted by anybody. The
research was necessary and the SDLC is worth having, but the ratio has to invert now.

**Action.** Wave 1 ships exactly one *publishable* package — `commander-agent` — to npm,
even at 0.1.0 with three of its requirements met. `cli-packaging` and `compat-oracle`
support that publish rather than preceding it. A wave that ends with nothing on npm is a
wave that did not happen.

### 1.2 Sixty-nine requirements is a specification, not a product

Nobody adopts a floor. The floor is how we know the work is right; it is not why anyone
installs it. There is currently no one-line answer to "what is this".

**Action.** The pitch is one sentence and one code block:

> Your CLI, drivable by an agent: `--json` on every command, exit codes that mean
> something, and no help text dumped on a runtime error. One wrap, zero dependencies,
> delete it any time.

The 69 requirements become the reference page, not the front page.

### 1.3 There is no real user

Every number is measured against a demo CLI we wrote to be measured. The agent benchmark
compares our layer against our own strawman. That is a closed loop and it will flatter us.

**Action.** One real CLI adopts the layer before wave 3 — the Interlace `eslint` repo's
own tooling is the obvious first target, and a small external OSS CLI the second. If no
real CLI will take it, that is the most important finding the project could produce, and
better learned in wave 2 than wave 5.

### 1.4 Wave 5's migration reason is missing, and it is load-bearing

The plan says: the layer makes your CLI agent-native on top of commander. Then the
replacement offers the same capability with a compatible API. **So why would anyone
switch?** If the floor already works on real commander, the replacement is a rewrite with
no user-visible benefit — a vanity project with 2,304 tests attached.

vitest had an answer (ESM-native, faster, one config with vite). We do not have one
written down.

The honest candidates, and only the first is currently evidenced:

| Candidate reason to migrate | Status |
| :--- | :--- |
| yargs cannot have its help replaced; the H1–H6 renderer will be thinner there | evidenced — yargs' help is not a public seam |
| commander and yargs block a floor requirement we cannot reach through public APIs | none found yet; would be discovered in waves 1–4 |
| the replacement is meaningfully lighter or faster | not evidenced: commander adds 16ms, so the ceiling is 16ms |
| §10 parsing fixes upstream will not take | plausible, unproven |

**Action.** Wave 5 stays in the roadmap but is **conditional**: it starts only when at
least one row above is evidenced by work done in waves 1–4, recorded in this file. If
waves 1–4 finish and no row is evidenced, the correct decision is to drop wave 5 and stay
a layer forever. That is a real possible outcome and pretending otherwise is how vanity
projects get built.

### 1.5 Four implementations of one semantic

`commander-agent`, `yargs-agent`, `commander-compat`, `yargs-compat` all implement the
same floor against different shapes, maintained by one person. The conformance suite
bounds the risk but does not remove the work.

**Action.** No new host adapter is written until the previous one's conformance cases are
green, and quirks are shared modules (see `replacement-parser` G3) rather than
per-front-end code. Already designed; restating it because it is the thing that will be
skipped under time pressure.

### 1.6 `--schema` is a public API with no version

Agents will consume it. The moment one does, its shape is a contract, and F1 does not
mention a version or a published schema.

**Action.** F1 gains: every `--schema` payload carries `schemaVersion` (semver), a JSON
Schema for it is published in the package and on the docs site, and a lock asserts the
emitted payload validates against it. Breaking the shape requires a major.

### 1.7 `selvage` is a bad name

Obscure, hard to spell, unknown to almost everyone, and it means nothing to a person
looking for a CLI framework. It was chosen because it was free, which is the wrong
first criterion. `treadle` and `sley` are worse.

**Action.** Renaming is free until wave 5, and wave 5 is conditional anyway. Park it.
Whatever it becomes, "can a person spell it after hearing it once" ranks above "is it on
brand".

### 1.8 The supply-chain story is a feature and is unstated

We are asking people to add a dependency to the program that runs in their CI with
their secrets. Zero runtime dependencies (K1), ESM-only, npm provenance and trusted
publishing are a genuine differentiator against `@oclif/core`'s 18 dependencies.

**Action.** K4 gains provenance and trusted publishing; the docs front page states the
dependency count as a headline number, because it is one.

### 1.9 The plugin architecture does not exist

M3 requires that "every plugin's contribution is attributed in the manifest" and the
current design is `program.use(plugin)` — a function that mutates the command tree, with
attribution recovered by diffing the tree before and after. That has three problems:

1. **Every plugin must be imported at startup** to find out what it contributes. This is
   exactly the 250-command problem (yargs #1005) that M2 is supposed to solve.
2. **Diff-based attribution is fragile.** A plugin that reorders or wraps existing
   commands is misattributed.
3. **It is imperative**, so nothing can be known about a plugin without executing it —
   which is also a security posture, not just a performance one.

This is the largest design gap in the plan, and §2 replaces it.

## 2. JS plugin extensibility, designed properly

### What the state of the art actually does

| Tool | Plugin model | The lesson |
| :--- | :--- | :--- |
| rollup / vite | named hooks on an object, `enforce: pre \| post` | the API shape everyone already knows — do not invent a new one |
| rolldown | hook **filters evaluated on the Rust side before crossing** into JS | never cross a boundary to discover you did not need to |
| oclif | a **manifest generated at build time** listing every plugin's commands | discovery must not cost startup |
| eslint flat config | plugins are **data** (`rules`, `configs`), not behaviour | data can be inspected without being run |

All four point the same way, and it is the opposite of `program.use()`.

### The design

A plugin is **data plus lazily-loaded behaviour**:

```ts
export default definePlugin({
  name: 'deploy',
  commands: [{
    name: 'deploy',
    description: 'Ship the current build',
    group: 'release',
    options: [ /* declarative, same schema as everything else */ ],
    load: () => import('./deploy.js'),        // the only thing that is code
  }],
  hooks: { preRun, postRun, onError },        // rollup-shaped, with enforce ordering
});
```

Two phases:

- **Build time** — `cli manifest` walks the declared plugins and emits one static JSON:
  every command, option, description, group, deprecation, and the plugin that
  contributed it. Attribution is *declared*, not diffed.
- **Run time** — read that JSON (one file), resolve the one command being invoked,
  `import()` only that handler.

What falls out:

- **`--help` and `--schema` are complete without loading a single plugin.** F1, F2 and
  M2 are satisfied by construction, and a 250-command CLI starts as fast as a
  one-command CLI. This is rolldown's "filter before you cross", applied to module
  loading instead of FFI.
- **Attribution is exact** (M3), because the plugin stated it.
- **A plugin can be inspected without being executed** — which matters when the thing
  reading it is an agent, and matters more when the thing installing it is a CI job.
- **Hooks stay rollup-shaped**, so the API is one people already know.

### What this costs

A build step. A plugin author runs `cli manifest` and commits the output, exactly as
oclif does. That is a real cost and the honest alternative — discovering plugins at
runtime — is what makes large CLIs slow. We take the build step.

## 3. A faster language for the engine

### The taxonomy that decides it

Every native rewrite people point to shares a profile, and it is not "it is a CLI".

| Tool | Language | What it is | Owns the process? | Work per run | JS extension |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TypeScript 7 / tsgo** | **Go** | compiler | yes | thousands of files | none — it *is* the tool |
| **oxlint** | Rust | linter | yes | thousands of files | JS plugins via raw transfer |
| **rolldown** | Rust | bundler | yes, via NAPI | thousands of modules | JS plugins, the known bottleneck |
| esbuild | Go | bundler | yes | thousands of files | JS plugins over IPC, documented as slow |
| **vite** | **TypeScript** | dev server / orchestrator | yes | orchestrates the natives | JS plugins — the entire point |
| **commander / yargs** | **TypeScript** | a library you `import` | **no — the user's CLI does** | ~5 argv tokens | it *is* JS |

Two readings, both important.

**Every native rewrite owns its process and does bulk work.** tsgo compiles thousands of
files; oxlint lints thousands; rolldown bundles thousands. Native startup is amortised
across that work, and the CPU-bound middle is where the multiple comes from.

**Every library that people import and extend stayed in JS — including vite.** Vite is
TypeScript. It got fast by *calling* esbuild and rolldown for the batch work, not by
becoming a binary. Its plugin API is JavaScript, and that is a large part of why it won.
"Following vite's best practices" means exactly this split: TypeScript for the thing users
import and extend, native for batch work that owns its own process.

One detail from tsgo is worth carrying: **Microsoft chose Go over Rust because it allowed
a near line-by-line port that preserved identical type-checking behaviour.** Hejlsberg
described Go as roughly the lowest-level language that still offers native code, a garbage
collector, cyclic data structures and good concurrency, without fighting the port. The
choice was driven by *behavioural fidelity to an existing implementation*, not by
benchmarks. If we ever go native, our equivalent constraint is the 2,304-test
compatibility suite — and that argues for Go on the same grounds.

### Where a native core does not work for us: the layer

`commander-agent` is imported into a CLI that somebody else wrote. By the time our code
runs, **Node has already started and its 29ms is already spent**. A native core would have
to be loaded into that process via NAPI, which costs `dlopen`, needs prebuilds for eight
or more targets, and breaks the bundling that vite, vitest, storybook, wrangler and vercel
all rely on. The ceiling on the win is the 16ms commander spends parsing.

The oxlint comparison also inverts. oxlint crosses the boundary per file and does
substantial native work between crossings, which is why raw transfer pays — and even so,
the bridge measurably slows it down versus native-only. Our profile is the pathological
one: cross the boundary **once**, in order to do **100% of the real work in JS**, because
the user's `action()` handler is the entire program. There is nothing to amortise.

**So the layer stays TypeScript.** Not a preference — a consequence of being imported
rather than invoked.

### Where a native core does work for us: the replacement

This is the part of the original review that was wrong, and it is worth stating plainly.

A *replacement* owns the process from argv. That changes the arithmetic completely,
because of a fact about how agents actually use a CLI: **most invocations never need the
handler at all.** `--help`, `--schema`, completions, and usage errors are answered
entirely from the manifest — and §2 makes the manifest a static JSON file generated at
build time.

A Go or Rust binary can read that JSON and answer those paths **without ever starting
Node**:

| Path | today (Node + commander) | native front-end |
| :--- | ---: | ---: |
| `--help` | 50ms | ~13ms |
| `--schema` | 50ms | ~13ms |
| `completions` | 50ms | ~13ms |
| usage error (exit 2) | 50ms | ~13ms |
| running a handler | 50ms | ~42ms (13 native + 29 Node) |

Discovery paths get roughly 4×. Execution paths come out slightly ahead. And for an
agent-native CLI, discovery is a large share of traffic — F1 exists precisely because an
agent's first move is to ask what the tool can do.

**This is the oxlint model, applied where the profile actually fits**: native does the
work that does not need JS, and JS runs only where JS is required. It is also the answer
to §1.4 — a migration reason the layer structurally cannot offer, because a layer is
imported into a process that has already booted.

### What the native front-end costs

Honestly, because these are the reasons to *not* do it:

1. **Platform binaries.** `optionalDependencies` per platform (the esbuild/swc model),
   eight or more build targets, and it breaks under `npm ci --ignore-scripts` and some
   corporate registries.
2. **It stops being importable.** The binary owns argv, so `import { Command } from …`
   is gone — and that is our entire adoption wedge for waves 1–4.
3. **It cannot be bundled**, and §8 shows leading CLIs bundle their CLI library.
4. **Two implementations of the floor**, native and JS, or the JS one is deprecated.
5. **A second toolchain in the repo**, with its own CI, release and supply-chain surface.

Costs 1–3 are why this cannot be the layer. They are acceptable for a replacement,
because a replacement is chosen deliberately by someone who wants what it offers.

### The decision

| Product | Language | Why |
| :--- | :--- | :--- |
| the layer (`commander-agent`, `yargs-agent`, waves 1–4) | **TypeScript** | imported into a running Node process; a native core is strictly worse |
| the plugin API, everywhere | **TypeScript, declarative** | vite's model; the manifest is what makes everything else possible |
| the replacement's front-end (wave 5, conditional) | **Go, candidate** | owns the process; serves discovery paths without Node; Go for tsgo's reason — portability against a 2,304-test fidelity suite |
| `eslint-plugin-cli-floor` | **Rust, as an oxlint rule** | owns its process, thousands of files, the one classic profile in the plan |
| build-time generators (manifest, completions, docs) | **TypeScript** | tens of files; Node does it in tens of milliseconds and a second toolchain buys nothing |

**The prerequisite for all of it is the same decision**: plugins and commands are
*declarative data with a build-time manifest*. A native binary can read a static manifest;
it cannot execute a JS plugin registration function. §2 is not only a performance and
security improvement — it is what keeps the native option open at all.

**The spike that decides wave 5.** Before committing: a Go binary that reads a manifest
produced by `commander-agent` and serves `--help`, `--schema` and completions, measured
against the same CLI on Node. If the discovery paths do not land near 13ms, the migration
reason evaporates and wave 5 should be dropped. Cheap, and it settles the question with a
number instead of an argument.

## 4. Actions

| # | Action | Where |
| :-- | :-- | :-- |
| A1 | Wave 1 ships `commander-agent` to npm, even partially complete | intents README |
| A2 | One-sentence pitch replaces the floor on the front page | `docs-deploy` |
| A3 | A real CLI adopts the layer before wave 3 | new intent `first-adopter` |
| A4 | Wave 5 becomes conditional on an evidenced migration reason | intents README, this file |
| A5 | F1 gains `schemaVersion` + a published JSON Schema + a validation lock | umbrella design |
| A6 | K4 gains npm provenance and trusted publishing; dependency count becomes a headline | umbrella design |
| A7 | `cli-modularity` R3 is replaced by the declarative plugin manifest of §2 | `cli-modularity` |
| A8 | The layer stays TypeScript; the native front-end becomes wave 5's candidate architecture and its migration reason | intents README |
| A9 | A Go spike serving `--help`/`--schema`/completions from the manifest decides wave 5, before any commitment | `replacement-parser` |
| A10 | `--mcp` serves the manifest as an MCP server — the AI feature the manifest already pays for | new intent `cli-mcp` |
