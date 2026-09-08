# When Rust or Go pays, and when it does not — what Vite, Rolldown, Oxc and esbuild concluded

> Research, 2026-09-08. Read for the roadmap's native rule (`.sdlc/intents/README.md`,
> "Native") and for `PRINCIPLES.md` rule 9 one level up. Every claim below quotes its
> source; where a source does not say something, that is recorded too.

The JavaScript toolchain moved to native code between 2020 (esbuild) and 2026 (Vite on
Rolldown and Oxc). The people who did it wrote down why, and where it stopped paying. Six
conclusions, each with the sentence it rests on.

## 1. Native pays for CPU-bound work repeated at scale, in a short-lived process

esbuild, on why it is written in Go rather than JavaScript
([FAQ: why is esbuild fast](https://esbuild.github.io/faq/#why-is-esbuild-fast)):

> "Most other bundlers are written in JavaScript, but a command-line application is a
> worst-case performance situation for a JIT-compiled language."
>
> "Go is designed from the core for parallelism while JavaScript is not. Go has shared
> memory between threads while JavaScript has to serialize data between threads."
>
> "Go can store things compactly in memory, which enables it to use less memory and fit
> more in the CPU cache."

Oxc, on where its speed comes from
([Performance](https://oxc.rs/docs/learn/performance.html)): a memory arena that
"allocates memory upfront in chunks or pages and deallocate altogether when the arena is
dropped" (about 20% on its own), boxed enum variants ("around 10% speed-up"), string
inlining, and parallel parsing. Result: the linter "is 84 times faster than ESLint".

**Reading.** Every win named is about *volume*: thousands of modules parsed, transformed,
and written, with parallelism across cores and compact memory across the whole run. The
JIT argument is real — a short-lived process never reaches optimised code — but it only
matters when there is enough work for the JIT to have mattered.

## 2. The larger win is doing the work once, not doing it in another language

VoidZero, announcing the unified toolchain
([Announcing VoidZero](https://voidzero.dev/posts/announcing-voidzero-inc)):

> "Performance-wise, it remains bottlenecked by duplicated parsing and serialization costs
> across different tools."

and the goal: "using the same AST, resolver, and module interop for all tasks (parsing,
transforming, linting, formatting, bundling, minification, testing), eliminating
inconsistencies and reducing redundant parsing costs".

Vite, on why it ran two engines and then stopped
([Why Vite](https://vite.dev/guide/why)): "maintaining two pipelines introduced
inconsistencies: different transformation behaviors, separate plugin systems, and growing
glue code to keep them aligned."

**Reading.** The team that went native says the bottleneck was *duplicated* work across
tools, and that two implementations of one job are a cost in themselves. The language
change was the vehicle; the unification was the point.

## 3. The JS–native boundary is the cost, so it is crossed rarely and filtered first

Vite's Rolldown guide ([Rolldown Integration](https://v7.vite.dev/guide/rolldown)):
hook filters were introduced "to reduce the communication overhead between the Rust and
JavaScript runtimes". Rolldown's own page
([Hook filters](https://rolldown.rs/plugins/hook-filters)): "Hook filters allow Rolldown to
skip unnecessary Rust-to-JS calls by evaluating filter conditions on the Rust side before
invoking your plugin."

Evan You, on plugins that are themselves in Rust
([Socket, on the React compiler decision](https://socket.dev/blog/rolldown-pulls-rust-react-compiler-integration)):

> "A Rust-based plugin is already much faster than Babel … but still up to 50% slower than
> a direct Oxc integration because of data passing and AST cloning overhead."

**Reading.** Even Rust-to-Rust across a plugin boundary costs half the gain. Anything that
crosses the boundary per item — per module, per frame, per token — loses most of what
native bought. The hot path lives entirely on one side; the other side is called seldom,
and only after a cheap native-side filter says it must be.

## 4. The plugin API stays JavaScript, because the ecosystem is the product

Vite ([Why Vite](https://vite.dev/guide/why)): Rolldown is "a Rust-powered bundler
compatible with the same plugin API the ecosystem already relied on."

**Reading.** Nobody was asked to rewrite a plugin. The engine changed under a surface that
did not. This is the lineage this repo already claims (Vite: the plugin API *is* the
product) and it is the exact shape of our compatibility play: the surface is compatible,
the engine is ours.

## 5. Native has a size cost, paid by every user on every install

The React compiler episode, in numbers
([Socket](https://socket.dev/blog/rolldown-pulls-rust-react-compiler-integration)): the
Oxc napi transform addon grew "from 3.51 MiB to 8.66 MiB"; the Rolldown binary "from
28.7MB to 33.8MB, representing a 17% growth". Evan You: "Vite is framework agnostic,
vendor agnostic, and we can't go down that slippery slope"; and "Vite is downloaded 12
million times a week", so uncached downloads cost bandwidth and CI time for everyone. It was
pulled. The follow-up target: "up to a 2x performance improvement with only a 1.4MB binary
size increase", as an opt-in for the users who benefit.

**Reading.** A native addon is megabytes, downloaded by everyone, whether or not they use
the feature. The maintainers of the most-installed native toolchain refused a 5 MB
addition for a feature most users would not touch. Native therefore lives behind its own
opt-in package, sized and ratcheted, never in the default path unless it pays for everyone.

## 6. What the sources do not say

- None of them claims JavaScript is slow for small, single-pass work. esbuild's argument is
  specifically about bundlers; Oxc's numbers are per-million-lines; VoidZero's is about
  redundant passes across tools.
- None of them measured a native addon's *load* cost against the work it saves. For a
  short-lived process that is the number that decides: loading a multi-megabyte `.node`
  file costs milliseconds before a single line runs.

## Applied to this repository

Our product *is* the short-lived process esbuild calls the JIT's worst case — and it does
almost no work in it. Measured 2026-09-06/07: bare Node 30 ms; `util.parseArgs` +2 ms;
burgee +5 ms; commander +16 ms; yargs +84 ms. Argv is parsed once. The help renderer, the
colour tokens and the frame loop are microseconds per call. So, by the six conclusions:

| Candidate | Volume? | Crosses a boundary per item? | Size paid by all? | Verdict |
| :-- | :-- | :-- | :-- | :-- |
| argv parser (`burgee`) | no — one parse, ≤ 5 ms total | n/a | yes, if in core | **no.** A native parser saves at most 5 ms and its addon load likely costs more. Re-measure at Z5 scale (hundreds of commands) |
| manifest + help at hundreds of commands (Z5) | maybe | no, if computed whole on one side | opt-in subpath | **measure first**; the one core candidate |
| colour tokens, policy (`roundel`) | no | yes — per string | yes | **no**, by (3): every token call would cross the boundary |
| frame loop, components (`flagstaff`) | no | yes — per frame | yes | **no**, by (3) |
| width / table maths at scale | at very large tables | no, batch | opt-in | measure; likely not |
| the lint rule (`eslint-plugin-cli-floor`) | yes — every file, every save | yes — oxlint's plugin API is JavaScript; a third-party rule runs as a JS plugin on the Rust host, crossing the boundary per file | oxlint users only | **yes, but as a JS plugin on oxlint**, not a native rule: the gain is oxlint's parser and host, the rule's logic stays JavaScript. A native rule exists only by upstreaming it into oxlint's core — a contribution, not a plugin (wave 5, corrected 2026-09-08) |
| compat oracle, bench harness | yes | no | private, never installed | any language, whenever it helps |
| single-binary distribution of a *user's* CLI | — | — | opt-in build step | **yes, and first**: removes the 30 ms *and* the Node install; language-independent |
| JS ↔ native plugin boundary, if any layer goes native | — | design rule | — | hook-filter pattern: native-side predicate before any JS call; never per token or per frame |

## The rule this yields

The roadmap's native rule stands, with three sharpenings the sources force:

1. **Measure the addon's load cost against the work saved**, for the process shape we
   ship (one short run). Faster code that arrives later is slower.
2. **Native lives behind its own opt-in package, sized and ratcheted** (K5 per platform),
   never in the default install path unless the default path measurably benefits every user.
   This is the React-compiler lesson, applied.
3. **Cross the boundary rarely and after a native-side filter.** A layer whose unit of work
   is a string or a frame stays on one side, and today that side is JavaScript.

And one that is not a sharpening but the main finding: **the largest gains the sources
report came from unifying work, not from changing language.** For this repository that is
already the architecture — one manifest projected to every surface, one policy read by every
component, one plugin object hosted by every layer — and it is why the numbers are at the
runtime's floor without a line of Rust.
