# Design — `native-engine`

Intent: [`intent.md`](./intent.md). **Status:** approved
([`D-20261027-native-engine-design-accepted`](../../decisions/D-20261027-native-engine-design-accepted.md)).
Evidence: [`m0/`](./m0/), re-run end to end by [`m0/reproduce.sh`](./m0/reproduce.sh).

---

## The answer first

**No burgee layer is ported to Rust in this batch, because none of the four candidates wins on the
user's number.** The first candidate, `burgee migrate`, was measured against a working Rust engine
on oxc, and the engine works. It produced byte-identical output on every file both builds
rewrote, and it runs the CPU part of the work 3.4–5.0x faster. But that CPU part is 0.6–8.0 ms of
a 90–135 ms command on the five field-trial projects. Node's start-up, the CLI's module load,
`git status` and file I/O are the rest, and a native engine removes none of them. The projected
whole-command speedup is 1.00x on their median, and even zero-cost native work would give
1.08x. Both are far below the 2x that
[`D-20261020-native-engine-order`](../../decisions/D-20261020-native-engine-order.md) sets for a
port (§ `M0` results). The argv core is the same shape again: at 300 commands, burgee's own parse,
dispatch and render cost 1.6–6.0 ms of a 50–80 ms run, and module loading is 71–94% of it.

So the design below is accepted for the day a layer *does* win. It covers how a Rust layer ships
from this repo, how it falls back, what it weighs, what it does to rule 2, and the gates it must
pass. `M0` has already proven the toolchain path for it: oxc 0.156, a 0.91 MB stripped binary, and
the byte comparison harness. Two candidates are still unmeasured, and their triggers are named.
The CI type-check lane waits on tsrs's stable release; on 2026-10-27 tsrs is
`0.20.0-ts7.1.0-beta`. Single-binary distribution is language-free and is measured against
Node's single-executable applications first.

## What was measured, 2026-10-27

Apple M4 Pro (14 cores, 48 GB), macOS 26.2, Node 24.12.0, Rust 1.99.1, burgee at `8a4bdaa325`
(1.7.2). **The machine was shared**: other agents held the load average between 40 and 160 for
the whole session, and each table states its load. The CPU-only columns are the robust ones:
they are in-process medians of 11 runs over files already in the page cache. The wall-clock
columns run JavaScript and Rust interleaved, so both see the same machine, but a wall-clock
millisecond here is not one a user's laptop would see.

### Subjects

- The five field-trial projects at their trial SHAs
  ([`adoption-barriers-2026-10.md`](../../research/adoption-barriers-2026-10.md)), which is
  D-20261020's yardstick: wait-port `16083537`, madge `456057b8`, tsc-alias `1077308b`,
  node-qrcode `3848ed2c` and svgo `e4cb29be`.
- Two large real monorepos, so the scale argument is tested rather than assumed: docusaurus
  `4e6fe616` (1,185 files, 3.9 MB) and typeorm `5bdc6788` (3,625 files, 10.9 MB).
- A10's own 1,000-file tree from `migrate-bench.test.ts` (`m0/bench-tree.mjs`), where two files
  in three import commander or yargs. That is the worst case for the scan.

### Where `burgee migrate`'s time goes today

`m0/phases.mjs` times `migrate`'s per-file work in process, against the built `dist/migrate.js`.
It covers the walk (`sourceFiles`), the batched reads, the byte pre-filter (`mentionsAHost`),
and the scan and rewrite (`rewriteSource`) over the files the pre-filter admits.
`scanAllFiles` is the lexer over *every* file, which is what a codemod without the pre-filter
would pay. Medians of 11 runs, in ms.

| Subject | Files | MB | walk | read | filter | scan + rewrite | per-file total | lexer over every file |
| :-- | --: | --: | --: | --: | --: | --: | --: | --: |
| wait-port | 15 | 0.03 | 0.7 | 1.9 | 0.2 | 0.4 | 4.0 | 0.3 |
| madge | 115 | 0.05 | 3.0 | 21.4 | 0.5 | 0.8 | 25.9 | 0.7 |
| tsc-alias | 183 | 0.12 | 9.3 | 43.9 | 1.5 | 0.9 | 54.3 | 1.1 |
| node-qrcode | 80 | 0.26 | 1.4 | 8.4 | 1.6 | 2.0 | 16.3 | 2.3 |
| svgo | 120 | 0.52 | 3.6 | 30.4 | 3.2 | 4.8 | 43.8 | 4.4 |
| docusaurus | 1,185 | 3.87 | 84.0 | 230.8 | 14.7 | 44.5 | 397.4 | 26.3 |
| typeorm | 3,625 | 10.89 | 163.3 | 1,409.0 | 37.3 | 113.2 | 1,738.9 | 74.4 |
| A10 tree | 1,000 | 3.33 | 2.4 | 386.9 | 10.5 | 15.7 | 416.5 | 20.5 |

The per-file work sits on top of a fixed cost. `burgee --version` alone takes about 50 ms here
(Node itself 21–25 ms). `migrate` on an empty project with a `package.json` takes 81–148 ms
(median 116 ms), which adds the `migrate` module graph, the manifest reads and a `git status`
child (25 ms by itself). A `--cpu-prof` of the whole command on typeorm agrees with the table:
`readdir` and `open` dominate the non-idle samples, and the lexer (`lex`, `push`, `endOfWord`,
`pass`) is 78 ms of self time.

**Reading.** On every subject, I/O and fixed costs dominate. The CPU work a native engine could
take over (filter + scan) is 0.6–8.0 ms on the field-trial projects and 150 ms on typeorm, the
largest real repository measured. The design note in `migrate.ts` (D-050) already said this:
"one pass, no AST" made the scan two orders of magnitude cheaper than a parse, and
`migrate-bench.test.ts` found the whole command bound by the filesystem.

### The argv core

`m0/argv/` holds a 1-command and a 300-command program on burgee's own API (`defineProgram`) and
a 300-command commander program. `m0/wall.mjs` times them interleaved, 21 runs, with the load
average at 78 / 60 / 43 (`results/argv-wall.json`). Medians, in ms:

| Run | 1 command | 300 commands |
| :-- | --: | --: |
| Node floor (`process.stdout.write`) | 24.8 | — |
| `import 'burgee'` alone | 44.9 | — |
| burgee, dispatch `greet ada` | 52.9 | 51.1 |
| burgee, `--help` | 67.5 | 68.8 |
| burgee, `--schema` | 70.2 | 77.6 |
| commander, dispatch `greet ada` | — | 39.5 |
| commander, `--help` | — | 39.3 |

A `--cpu-prof` of the 300-command program (`results/argv-profile.txt`, bucketed by
`m0/argv/profile-buckets.mjs`) puts burgee's own parse, dispatch and render at **1.6 ms**
(dispatch), **6.0 ms** (`--help`) and **4.5 ms** (`--schema`). Module loading (resolve, read,
compile) is 71–87% of each run.

**Reading.** D-20261020 expected the argv core to stay JavaScript, and the profile confirms it. A
native parser could remove at most about 6 ms from a 50–80 ms run, before paying for its own
addon load. The table also shows something that is not a native question. At 300 commands,
burgee's `--help` on its native API is 1.75x commander's here, and the profile puts that gap in
module loading. The lever is what the entry imports, not the language it is written in. It is
recorded under § Out of scope as a JavaScript finding for its own intent.

### The CI type-check lane and single-binary distribution

- **tsrs** on npm on 2026-10-27: `latest` is `0.20.0-ts7.1.0-beta`, a beta against TypeScript
  7.1's beta, with seven platform packages (`@tsrs/darwin-arm64` unpacks to 21.7 MB,
  `@tsrs/linux-x64-gnu` to 32.9 MB). D-20261020's gate is a stable release against TypeScript
  7.1, so it is **not met**, and nothing was run.
- **Single-binary distribution** is not a Rust question (rule 9: "The largest latency win is
  language-free"). Node 24.12 has `--experimental-sea-config` but needs the third-party
  `postject` to inject the blob, which this batch does not install. It is **not measured**, and
  R9 says what measures it.

## `M0` — the spike

[`m0/spike/`](./m0/spike/) is a Rust crate (`burgee-migrate-spike`, `publish = false`, its own
Cargo workspace root, `target/` gitignored). It is outside every npm workspace and every published
package's `files`, and eslint skips it like oxmutate's `M0`. It does `migrate`'s per-file half on
oxc 0.156:

- the walk, with `migrate.ts`'s extensions and skipped directories;
- the read, and the byte pre-filter as `memchr::memmem` over the same host names;
- a full `oxc_parser` parse (JSX enabled for `.js`, as oxlint does);
- a visitor over every position `migrate.ts` reads: `import … from`, `import 'x'`, `export … from`,
  `export * from`, `import()`, `require()`, `import x = require()`, `typeof import()`, and the
  `vi.*`, `jest.*` and `require.resolve` calls;
- span edits that replace the bytes between the quotes.

Both builds read one mapping table, `m0/mapping.tsv`, which `m0/export-mapping.mjs` exports from
the built `MAPPING` (46 specifiers). The refusal rules are not ported: deep imports, computed
specifiers, façade names and sibling state. A file the JavaScript build refuses or keeps is
counted and left out of the byte comparison. On these subjects there were none.

### `M0` results

**Bytes.** The fixture `m0/fixture/cli.ts` holds 13 specifiers in 10 positions, plus decoys in
strings, a template, comments and an object key. The Rust output is **byte-identical** to
`rewriteSource`'s (`m0/fixture/cli.expected.ts`). Across all eight subjects, **701 of 701**
rewritten files are byte-identical. No file was rewritten by Rust alone, and none by JavaScript
alone (`results/bytes.jsonl`, `m0/compare.mjs`).

**Parse coverage.** oxc rejects 2 of 4,810 real files: typeorm's codemod test fixtures
`column-readonly-metadata-args-namespace.{input,output}.ts`. JavaScript's lexer reads every file.
Before JSX was enabled for `.js`, oxc also rejected 16 docusaurus files. A product engine
therefore needs the lexer as its fallback for any file oxc rejects (R4).

**CPU, in process, single thread, 11 runs** (`results/phases.jsonl`). This compares filter +
scan in JavaScript against filter + parse + rewrite in Rust:

| Subject | JS CPU | Rust CPU | Ratio |
| :-- | --: | --: | --: |
| wait-port | 0.6 ms | 0.2 ms | 3.6x |
| madge | 1.3 ms | 0.3 ms | 4.1x |
| tsc-alias | 2.4 ms | 0.5 ms | 5.0x |
| node-qrcode | 3.6 ms | 1.0 ms | 3.6x |
| svgo | 8.0 ms | 2.1 ms | 3.9x |
| docusaurus | 59.2 ms | 15.9 ms | 3.7x |
| typeorm | 150.5 ms | 37.3 ms | 4.0x |
| A10 tree | 26.2 ms | 7.8 ms | 3.4x |

Rust does more per file here, because it builds a full AST rather than a token stream, and it is
still 3.4–5.0x faster. The pre-filter alone is about 10x (`memmem` against `Buffer.includes`).

**I/O.** Node already overlaps reads across the libuv pool. A sequential Rust read loop is 2–4x
*slower* than Node's batched reads (typeorm: 6,420 ms against 1,409 ms, under load). With 8
threads, Rust's whole per-file pipeline lands level with Node's: typeorm 1,491 ms against
1,739 ms, and the A10 tree 401 ms against 417 ms. Changing language does not buy I/O; parallelism
does, and Node already has it.

**Whole command.** `m0/gate.mjs` measures every term of the gate in the same round, back
to back, so a ratio never mixes two machine states. Each round runs (a) the JavaScript
`migrate --dry-run`, (b) the JavaScript per-file work in a fresh process, cold as the command has
it, and (c) the Rust binary's whole per-file pipeline with 8 threads, process start included.
*Ceiling* is (a) ÷ (a − b): the speedup if native did all of the per-file work in zero time.
*Projected* is (a) ÷ (a − b + c). Medians of 7 rounds (`results/gate.json`). The load average
was 111–155 throughout, so every absolute millisecond below is inflated about tenfold. The
ratios are the result.

| Subject | JS `migrate` wall | JS per-file work | Rust binary, whole pipeline | Ceiling | Projected |
| :-- | --: | --: | --: | --: | --: |
| wait-port | 1,700.7 ms | 7.1 ms | 12.2 ms | 1.00x | 1.00x |
| madge | 849.9 ms | 135.8 ms | 82.4 ms | 1.09x | 1.01x |
| tsc-alias | 1,501.8 ms | 154.1 ms | 159.4 ms | 1.14x | 1.00x |
| node-qrcode | 1,352.3 ms | 87.3 ms | 93.0 ms | 1.07x | 1.00x |
| svgo | 1,278.8 ms | 159.6 ms | 108.1 ms | 1.08x | 1.03x |
| docusaurus | 3,167.6 ms | 1,025.3 ms | 1,034.2 ms | 1.48x | 1.06x |
| typeorm | 6,222.3 ms | 2,920.4 ms | 1,937.2 ms | 1.93x | 1.15x |

**Median over the five field-trial projects: ceiling 1.08x, projected 1.00x.** For scale, the
same JavaScript commands at a load of 30–49 (`results/migrate-wall-load45.json`, 11 interleaved
runs) took 90–135 ms on the field-trial projects, 548 ms on docusaurus and 842 ms on typeorm,
against a 50 ms `burgee --version` and a 21 ms Node floor. Spawning the binary from Node costs
7.05 ms median (`results/spawn.json`), which is more than the whole CPU part on four of the five
field-trial projects.

**A run that is kept and not used.** `reproduce.sh`'s first whole-command pass ran at a load of
162–179. Its JS medians were ten times the quieter run, and two maxima read 305 s and 2,569 s,
which looks like the machine stalled. It is kept as `results/wall-load170-invalid.json` with its
summary, so the exclusion can be checked, and nothing on this page is computed from it.
`gate.mjs` replaced it because a ratio taken within one round survives load; a ratio of two
medians from different hours does not.

**Verdict: below the gate, by a wide margin.** Even the ceiling, with zero-cost native work, is
1.08x on the field-trial median, and 1.93x on typeorm, the largest repository measured. Neither
reaches 2x.
`migrate` stays JavaScript (R1), and `M0` stays as the evidence and the starting point.

### What a port would weigh

- **The binary.** 0.91 MB stripped for darwin-arm64 (fat LTO, `codegen-units = 1`,
  `panic = "abort"`). That is 87% of burgee's own unpacked size (1.7.2: 1,047,519 B; 1.8.0: 1,048,495 B), added per
  platform for anyone who opts in. For comparison: `@oxc-parser/binding-darwin-arm64` 1.8 MB,
  `@esbuild/darwin-arm64` 10.6 MB, `@tsrs/darwin-arm64` 21.7 MB, `@biomejs/cli-darwin-arm64`
  76.2 MB (`npm view … dist.unpackedSize`, 2026-10-27).
- **The crate graph.** 76 crates compiled into the binary besides the spike itself (`cargo tree -e
  normal`): oxc's eleven, plus ICU segmentation data, serde, phf, num-bigint and others. None of
  them is an npm dependency, but every one is supply chain. R7 says how that is held.
- **Build cost.** A cold release build, all 76 crates included, took about 30 s on this machine
  under load, and an incremental one 9–16 s. That is the seed for the CI-minutes ceiling
  D-20261020 §4 asks for (R10).

## Requirements

These bind any layer that passes R1's gate. None is built in this batch, because no layer has
passed.

- `R1` — **The port gate.** A layer is ported only when `m0/reproduce.sh`, or that layer's copy of
  it, shows a projected median speedup of at least **2.0x** on the user's own number. For
  `migrate`, that is whole-command wall time on the five field-trial projects
  (D-20261020 §1). For the argv core, it is B2. The projection is
  `JS whole − JS per-layer work + native per-layer work + boundary cost`, with every term
  measured, and the result is recorded as a port-or-drop decision.
- `R2` — **Opt-in, never default.** The native engine ships as its own package, `burgee-native`
  (name free on npm on 2026-10-27). burgee's `dependencies`, `optionalDependencies` and `files`
  do not change, so `npm install burgee` installs the same bytes before and after, and
  `weight.test.ts` and the B4 rows hold that.
- `R3` — **One prebuilt package per platform, as optional dependencies.** `burgee-native`
  lists `@burgee/native-<os>-<arch>[-<libc>]` as `optionalDependencies`, each with `os`, `cpu` and
  (on Linux) `libc` set, so npm installs only the matching one. The targets are tsrs's seven plus
  win32-arm64: darwin-arm64, darwin-x64, linux-x64-gnu, linux-x64-musl, linux-arm64-gnu,
  linux-arm64-musl, win32-x64, win32-arm64. All are published from this repo with provenance, and
  there is no postinstall step. If the `@burgee` scope cannot be claimed before the first publish,
  the names are `burgee-native-<os>-<arch>[-<libc>]`.
- `R4` — **A binary for a tool, in process for a library** (rule 9). `migrate` is a tool, so its
  engine is an executable spawned once per run, not a `.node` addon. The JavaScript side hands it
  the project root and the mapping table once, and receives one JSON document of sites per file.
  That is the boundary crossed once per run (`native-when-it-pays.md` §3). Classification,
  refusals, the preflight and the report stay in JavaScript, so there is one implementation of
  every rule. A file oxc rejects comes back as `parse-error` and is scanned by the JavaScript
  lexer.
- `R5` — **The fallback is complete, and it is the JavaScript build.** burgee resolves
  `burgee-native` with a guarded `createRequire(…).resolve`. It uses the JavaScript build when
  the package is not installed, when no platform package matched, when the binary is missing or
  not executable, when it exits non-zero, when its protocol version differs, or when it writes
  output that does not parse. Each of those is a test that fails if the run errors instead of
  falling back.
- `R6` — **Graded by the same suites, plus a differential.** Every `migrate*.test.ts` runs
  against both engines (`BURGEE_ENGINE=js|native`). The `M0` differential (`m0/compare.mjs`) is a
  required check over the eight subjects: 100% byte-identical, and zero files rewritten by one
  engine only. The compat-oracle grades (commander 1,360/1,360, yargs 816/816) are unchanged,
  because `migrate`'s output is what they grade.
- `R7` — **Rule 2, held at the npm graph, and the crate graph counted.** No published package
  gains an npm dependency outside this repo. The binary's crate graph is pinned by a committed
  `Cargo.lock`, checked by `cargo deny` (licences, advisories, sources limited to crates.io) in
  the Rust CI lane, and its crate count is ratcheted like a weight row. Today that count is 76.
  The decision records why this is a reading of rule 2, not a waiver.
- `R8` — **Weight, ratcheted per platform.** Each platform package gets a size ratchet in
  `benchmarks/weight` at its first published size. The darwin-arm64 seed is 0.91 MB, and no
  package may grow more than 10% without a decision file. The docs' weight page gains a native
  column beside the JS one (intent criterion 2), and the default column does not move.
- `R9` — **Single-binary distribution is measured before any Rust is written for it**
  (D-20261020 §3): Node's single-executable application, `bun build --compile` and
  `deno compile`, on B2 for one example program. That is its own intent, opened when it is
  scheduled, because it is a build step for a *user's* program, not a burgee engine.
- `R10` — **CI cost is capped before the toolchain lands.** The Rust lane runs only on changes
  under the native crate's paths. The cross-compile matrix runs on release only. Its ceiling is
  20 CI-minutes per release, seeded from `M0`'s 30 s cold build per target plus runner start-up.
  No Rust toolchain is added to CI until a port passes R1. `.github/` is not edited in this
  batch.
- `R11` — **WASM only where it adds a platform the JavaScript build lacks.** Rule 9 lists a WASM
  fallback. For a layer whose JavaScript build is complete, the JavaScript build *is* the
  fallback, and a WASM build would add a third implementation with no platform gained. A WASM
  target (`wasm32-wasip1`, which oxc ships as `@oxc-parser/binding-wasm32-wasi`, 1.7 MB) is
  built only for a layer that has no complete JavaScript build.

## Design

**Package shape, for the first port that passes R1.**

```text
crates/burgee-engine/            # the Rust crate, grown from m0/spike (Cargo.lock committed)
packages/burgee-native/          # JS: locate the platform binary, spawn, validate the protocol
npm/native-<os>-<arch>[-<libc>]/ # generated per release: package.json (os, cpu, libc) + binary
```

`burgee-native` exports `engine(): { version, run(root, table) } | undefined`. `migrate.ts` calls
it once. `undefined`, or any failure listed in R5, means the existing code path runs unchanged.
That keeps the JavaScript build the reference implementation, and keeps `migrate`'s module graph
free of the native package. It is a dynamic import on the `migrate` path only, as `migrate.js`
already is from `cli.ts`.

**The protocol** is one JSON document on stdout with a `protocol` integer, and per file the
sites `migrate.ts` already models: `start`, `end`, `line`, `specifier`, the position kind, and the
clause for `from` imports. Spans are UTF-16 offsets, converted in Rust, so the JavaScript side
applies edits exactly as `rewriteFile` does today.

**oxc version.** The `oxmutate` intent also builds on oxc. Its `M0` used `oxc-parser` 0.127
through the npm binding; this `M0` used the 0.156 crates. When both build, the repo pins one oxc
version for both, and a bump is one PR that re-runs both differentials.

**State.** None is introduced. The fallback in R5 is one pure selection, made once per run with
no retries or ordering, so there is no Quint model. If a later layer adds a long-lived engine
process or a cache, it gets one under `.sdlc/models/`.

## Verification

- `bash .sdlc/intents/native-engine/m0/reproduce.sh <work-dir>` re-runs every number on this
  page. It exits non-zero if the fixture's bytes differ (`cmp`), if the build fails, or if a
  command in the wall-time set fails.
- For a port, the required checks are R6's differential (exits 1 on any differing or one-sided
  file), the `migrate*.test.ts` suites under both engines, R5's fallback cases (each proven red
  by making the run throw instead of falling back), `weight.test.ts` for R2, and the per-platform
  ratchet for R8.

## Gates — success criteria, measurable

| Gate | Measure | Pass | `M0` reading |
| :-- | :-- | :-- | :-- |
| G1 port | projected median whole-command speedup, five field-trial projects | ≥ 2.0x | 1.00x (ceiling 1.08x): **fails** |
| G2 bytes | differential over the eight subjects | 100% identical, 0 one-sided | 701 / 701, 0 one-sided — passes |
| G3 coverage | real files the native parser rejects, with the lexer fallback | 0 lost | 2 / 4,810 rejected, so fallback needed |
| G4 default weight | `npm pack burgee` unpacked bytes before and after | equal | holds (nothing published) |
| G5 fallback | each R5 failure mode | runs the JS build, exit unchanged | not built |
| G6 platform size | per-platform package size | ≤ seed + 10% | seed 0.91 MB darwin-arm64 |

## Rejected alternatives

- **Port `migrate` anyway, because the owner asked for a Rust burgee.** Rejected by rule 4 and by
  D-20261020's own 2x rule. The measured ceiling is below 2x even with zero-cost native work.
  Every opted-in install would pay 0.91 MB and 76 crates of supply chain for a few milliseconds.
  The owner's request is kept as this design, with `M0` proving the path, rather than as a binary
  nobody's number needed.
- **Port all of `migrate`, report included, to one native executable**, so the Node start-up and
  module load go too. Rejected: npm's `bin` is still started through Node on every platform that
  has no postinstall step (rule 9 forbids one), so Node's 21–25 ms and the CLI's ~50 ms stay. The
  `git status` child (25 ms) stays too. It would also be a second implementation of about 4,000
  lines of rules that the compat-oracle grades, which is the duplicated-pipeline cost Vite paid
  and removed (`native-when-it-pays.md` §2).
- **A napi-rs `.node` addon for `migrate`.** Rejected for a tool by rule 9 ("a binary for tools").
  It also ties the build to Node's ABI, and its load is paid inside the CLI process, where every
  other command pays it as well.
- **Use the npm `oxc-parser` binding instead of our own binary.** Rejected: it is a third-party
  npm dependency of a published package, which rule 2 forbids. Its 1.8 MB per platform also buys a
  parser without our visitor, so every site would cross the boundary as ESTree JSON.
- **Port the lexer as written, rather than parse with oxc.** Not needed for this decision: the
  lexer's CPU share is already below the gate with zero cost. It would be the better engine if R1
  ever passes on CPU alone, because it reads every file the lexer reads (G3). Revisit then.
- **Rust for parallel I/O.** Rejected on measurement: Rust with 8 threads is level with Node's
  batched async reads.

## Out of scope

- **Publishing anything.** No package is created, published, or given a new dependency in this
  batch, and `.github/` is not edited.
- **The argv core's module-loading cost at 300 commands** (burgee `--help` 68.8 ms against
  commander's 39.3 ms in `results/argv-wall.json`). That is a JavaScript entry-graph question for
  the `burgee` umbrella's B2 work, not for a native engine.
- **oxmutate's engine.** `oxmutate` is native as its product, and its packaging follows this
  page's R2–R8. Its measurement is its own.
