# The competitor map, and why we ship a layer before a compatible replacement

Snapshot 2026-09-06. Every number below was measured, not recalled: downloads from
`api.npmjs.org/downloads/point/last-week`, repo stats from the GitHub API, cold-start
from 30 runs per target on this machine (Node 24, darwin/arm64). Reproduce with
[`scripts/fetch-competitor-issues.sh`](../../scripts/fetch-competitor-issues.sh) and
the bench recipe at the end.

Companion document: [what 329 open issues say](./competitor-open-issues.md).

## 1. The map — four cohorts

| Package | DL/wk | Stars | Latest | Deps | How it got its users |
| :--- | ---: | ---: | :--- | ---: | :--- |
| **commander** | 508.2M | 28.4k | 2026-05 | 0 | won 2011-2015, now transitive everywhere |
| **yargs** | 259.3M | 11.5k | 2026-07 | 6 | same era, same mechanism |
| cac | 49.4M | 3.1k | 2026-02 | 0 | bundled in vite / vitest |
| citty | 30.5M | 1.3k | 2026-04 | 0 | bundled in nitro / unjs |
| @drizzle-team/brocli | 16.2M | 475 | 2026-09 | 0 | bundled in drizzle-kit |
| @oclif/core | 10.9M | 316 | 2026-08 | 18 | Salesforce + Heroku CLIs |
| clipanion | 5.3M | 1.3k | 2024-09 | 1 | bundled in yarn |
| @effect/cli | 249k | — | 2026-07 | 3 | rides Effect |
| cmd-ts | 225k | 365 | 2026-02 | 4 | chosen on merit |
| gunshi | 72k | 463 | 2026-09 | 0 | chosen on merit |
| clerc | 27k | 228 | 2026-02 | 8 | chosen on merit |
| **stricli** | **16** | 1.1k | 2025-04 | 0 | chosen on merit |
| meow | 42.8M | 3.7k | 2026-02 | 0 | sindresorhus gravity |
| sade | 9.8M | 1.1k | 2022-01 | 1 | stale |
| args | 2.0M | — | 2022-05 | 4 | stale |
| vorpal | 39.7k | — | 2017-04 | 10 | dead |
| @caporal/core | 17.9k | — | 2023-08 | 13 | dead |

Four cohorts, and only one of them is a path:

1. **Incumbents with distribution** — commander, yargs. 767M/wk combined. Both still
   shipping releases this year. Neither is neglected.
2. **Modern frameworks that won by being bundled** — cac, citty, brocli, clipanion.
   Every one of them got its downloads from a single popular parent (vite, nitro,
   drizzle-kit, yarn), not from developers picking it.
3. **Modern frameworks that lost despite being better** — stricli, gunshi, cmd-ts,
   clerc. Combined: under 0.4M/wk, or **0.05% of commander**.
4. **Dead** — vorpal, caporal, args, sade.

**stricli is the finding.** Bloomberg published a genuinely better-designed, fully
typed, zero-dependency CLI framework in 2024, launched it with an engineering blog
post, and earned 1.1k stars. It does **16 downloads a week**. Merit, funding, design
quality and a launch platform, and it did not move the needle. There is no example in
this table of a post-2015 framework winning on quality alone.

## 2. "Faster" is not available

Cold start, median of 30 process spawns, trivial one-subcommand CLI:

| Target | ms | over bare node |
| :--- | ---: | ---: |
| bare node (`process.stdout.write('')`) | 34 | — |
| `node:util.parseArgs` (stdlib) | 36 | +2 |
| cac | 39 | +5 |
| citty | 40 | +6 |
| **commander** | **50** | **+16** |
| meow | 86 | +52 |
| **yargs** | **118** | **+84** |

Node's own startup is 34ms and we do not control it. A *perfect* parser beats
commander by 16ms on a CLI that does nothing; on a CLI that touches the disk or the
network it is unmeasurable. Speed is not a differentiator against commander, and no
amount of engineering makes it one inside Node.

It *is* a differentiator against yargs: +84ms versus +16ms, a 5× gap, paid on every
invocation. For an agent running fifty CLI calls in a loop that is four seconds. This
is an argument for `yargs-agent` telling people the truth about their host, not for us
writing a parser.

## 3. "More capable" is available, and it is not the parser

329 open issues across commander, yargs, oclif, citty and clack were read in full
([the details](./competitor-open-issues.md)). Grouped by what they ask for:

| Cluster | Roughly | In a parser? |
| :--- | ---: | :--- |
| help / usage rendering | ~20% of yargs' tracker | no |
| config + env precedence | large | no |
| validation & option relationships | large | no |
| machine-readable output, introspection, agent envs | newest, most-commented | no |
| error lifecycle, exit behaviour, flush guarantees | large | no |
| completions | 18+ issues | no |
| TypeScript inference from one schema | 11+ issues | no |
| modularity for 250-command CLIs | large | no |
| **argv parsing edge cases** | **one cluster** | **yes** |

commander has **7 open issues** and **zero runtime dependencies**. It is not lean
because it is abandoned — it shipped in May and it is maintained. It is lean because
tj has consistently declined to own the layer above parsing. That is not a weakness to
attack. It is a vacancy, and the vacancy is the entire product.

Building "a better commander" means building all nine non-parser rows anyway. The
parser row is the one part that is already solved, twice over, for free, and is now in
the Node standard library.

## 4. The dependency, stated honestly

Relying on commander is a real cost. Here is its actual size.

**What we touch.** Six public APIs: `exitOverride()`, `configureOutput()`,
`parseAsync(argv, { from: 'user' })`, `hook('preAction')`, `configureHelp()`,
`Option#env()`. All documented, all stable across commander 8 → 15, none deprecated.

**What we do not touch.** No internals, no monkey-patching, no prototype surgery.
`commander-harness` already recognises commander errors *by shape* rather than
`instanceof`, so it survives multiple copies of commander in one tree.

**Where the capability lives.** In `@interlace/cli-core`, which has zero host
dependencies and does not import commander or yargs. The adapters are thin. The
exit-code contract, the runtime seam, the JSON envelope and the manifest are all
host-neutral by construction.

**The insurance policy is the second host.** A layer bound to one parser is a hostage.
A layer that passes the *same conformance suite* on commander and on yargs is portable
by construction — the suite is the proof that nothing commander-shaped leaked into the
core. We already run 11 conformance cases against both hosts. That suite is not a
testing nicety; it is the strategic asset.

## 5. The strategy: compatible replacement, layer first

The two options are usually posed as a choice. They are one audience served twice.

**The precedent that matters.** Section 1 shows no framework has won on a *new* API.
But drop-in replacements that copied an incumbent's API have repeatedly won:

| Challenger | DL/wk | Incumbent | DL/wk | Compat approach |
| :--- | ---: | :--- | ---: | :--- |
| **vitest** | **99.9M** | jest | 48.0M | copied the API — **overtook it** |
| pnpm | 177.6M | npm | 15.6M* | copied the CLI surface |
| rolldown | 89.7M | rollup | 124.6M | copied the API — closing |
| preact | 31.8M | react | 171.6M | `preact/compat` |
| @rspack/core | 9.0M | webpack | 56.4M | copied the config format |
| @biomejs/biome | 14.4M | eslint | 159.4M | *partial* compat — slowest of the six |

`*` npm ships inside Node, so its registry figure understates it badly.

The correlation runs one way: the more faithful the compatibility, the better it went.
Biome, the one that asked people to rewrite their configuration, is the laggard.
stricli's 16 downloads and vitest's 99.9M are the same lesson from opposite ends —
**copy the API, do not invent one.**

### The compat bill, measured

Cloned at depth 1 on 2026-09-06 and counted:

| | commander | yargs + yargs-parser |
| :--- | ---: | ---: |
| public methods | 151 (Command 90, Help 40, Option 14, Argument 7) | 108 |
| source LOC to re-behave | 4,180 | 7,673 |
| upstream tests that must pass | 1,119 | 1,185 |

**259 methods, ~11,850 LOC, 2,304 tests.** Finite and gradeable. No calendar estimate
is given here on purpose: see *the oracle* below, which replaces the estimate with a
number that can be read off CI on any given day.

### The oracle: the competitor wrote our feedback loop

`AI_NATIVE_SDLC.md` rule 2 says give yourself a feedback loop before you start — one
command that exits non-zero on failure. For compatibility we do not have to write one.
commander's own suite *is* that command, and it is redirectable at a single line.

commander's 105 test files import the library as `from '../index.js'` and assert with
`node:test` + `node:assert/strict`. Copy the suite, rewrite that one specifier to a
shim, and the entire upstream gate points wherever we want:

```js
// impl.js — swap this single line to grade a different implementation
export * from 'commander';
```

Measured 2026-09-06 on this machine:

| | |
| :--- | ---: |
| test files redirectable to the shim (public surface) | **96 / 105** |
| files testing internals via `../lib/command.js` (out of scope) | 9 |
| tests executed through the shim | **1,215** |
| passing against real commander | **1,210** |

The 5 failures are fixture subprocesses resolving `commander` from a flat copy's root —
an artifact of the ten-minute spike, not a real gap. The gate is sound.

**What this changes.** Compatibility stops being a project to estimate and becomes a
burn-down against a number that only goes up, where every failure is a precise,
reproducible, independently assignable task with an executable acceptance test already
written. That is the ideal shape for agent work, and it is why a calendar estimate
calibrated on human throughput is the wrong instrument.

**What it does not change.** Three costs are not compressed by generating code faster:

1. **Review capacity.** Rule 3 says a human accepts at Design→Build and at Deploy.
   Twelve thousand lines produced in days becomes a review queue; the binding
   constraint moves from writing to accepting, and no amount of generation speed moves
   it back.
2. **Behaviour the suite does not cover.** 1,215 tests over 4,180 LOC is good coverage,
   not total coverage. Silent divergence lives in the gaps, and real CLIs depend on
   emergent behaviour nobody wrote a test for — vitest's jest-compat pain was never the
   documented API, it was the long tail.
3. **The treadmill.** Upstream keeps shipping. Re-running the gate on every upstream
   release is permanent cost, not one-off cost.

So: implementation compresses hard, confidence does not compress the same way. Build the
oracle first, publish the pass rate from the first commit, and let the ratchet answer
the schedule question instead of anyone's intuition.

### The wall, and why it costs us nothing

commander and yargs disagree on *observable* behaviour: camelCase conversion, `-abc`
bundling, `--no-` negation, array accumulation, dot-notation objects, unknown-option
handling, `--` semantics. One parser cannot be bug-compatible with both. Two
front-ends over one core is the only shape that works — which is the architecture
already built. The layer packages become the compat front-ends. Nothing is wasted.

```
cli-core  (host-neutral: exit codes, envelope, manifest, precedence, help data)
   ├── commander-agent   → later also commander-compat  (151 methods, 1,119 tests)
   ├── yargs-agent       → later also yargs-compat      (108 methods, 1,185 tests)
   └── parser            over node:util.parseArgs (+2ms, stdlib, zero deps)
```

### "100%" is a number we publish, not a promise we make

An unfalsifiable claim is the first thing a sceptic disproves. The checkable version is
stronger: **run their suites in our CI and publish the pass rate.** Vitest still ships a
documented Jest-differences page and won anyway.

Cheap and available immediately: vendor both upstream suites into CI and run them
against the *layer* now. It proves the layer preserves compatibility today, and it is
the identical gate that certifies the replacement later. The compat suite accumulates
from day one rather than starting in year three.

### Order, and the reason for it

1. `commander-agent` / `yargs-agent` — add a package, keep your parser, zero migration
   risk. This earns trust.
2. the replacement with `commander-compat` / `yargs-compat` — change one import. This
   collects it.

**Compatibility is the on-ramp, not the product.** A flawless commander clone with no
added capability gives nobody a reason to switch; vitest won because it was
Jest-compatible *and* ESM-native and faster. Compat removes the objection, the floor is
the reason. So the floor ships first — it is what makes the replacement worth adopting.

Names reserved for the replacement (verified free 2026-09-06): `selvage`, `treadle`,
`sley`.

## 6. Compatibility must not cost weight: pay per import, never per config

Being compatible with both hosts must not make us heavier than either, still less than
their sum. Measured install sizes to beat:

| | KB |
| :--- | ---: |
| cac | 52 |
| citty | 52 |
| commander | 232 |
| yargs | 376 |

**The trap is runtime configuration.** A `compat: 'commander'` flag read at run time
ships every byte of both front-ends and merely declines to execute one. That is the
worst outcome: full weight, no benefit.

**Weight is paid per import.** The `preact/compat` model — compatibility lives behind a
separate specifier, so a user who never imports it never bundles it:

```js
import { defineCommand } from 'selvage';            // core only, no host quirks
import { Command }       from 'selvage/commander';  // + commander's 151 methods
import yargs             from 'selvage/yargs';      // + yargs' 108 methods
```

Individual quirks that a user *does* want (camelCase conversion, `-abc` bundling,
`--no-` negation) are opt-in behaviours composed onto the core, each separately
importable, so the core keeps none of them.

**Enforced, not hoped.** `cli-packaging` already carries a size ratchet; it gains two
assertions:

- the core entry point's bundled size stays **under cac's 52KB**;
- a core-only import pulls **zero bytes** of either compat front-end — asserted by
  bundling a fixture and grepping the output, so a stray import fails CI;
- core + one compat front-end stays under the host it replaces (232KB / 376KB).

That last one is also the marketing line, and unlike "100% compatible" it is a number
anyone can check.

## 7. Rust or Go: no, and the measurement says why

| | ms |
| :--- | ---: |
| `/bin/echo` (C binary) | 6 |
| `esbuild --version` (Go binary) | 13 |
| `node -e ""` (empty JS process) | 29 |
| node + commander | 50 |

A native binary saves ~20ms **by not being Node**, not by being Rust. We cannot not be
Node: the instant `--name ada` is parsed we call `action(opts)`, which is the user's
JavaScript. The process is Node whatever language the parser is written in, so Rust's
ceiling is the 16ms commander adds — minus NAPI `dlopen` cost, which routinely exceeds
it.

It also breaks bundling. vite, vitest, storybook, wrangler and vercel all bundle their
CLI library at build time (§7); a native addon cannot be bundled and needs prebuilds
for 8+ targets.

oxlint's 50-100x comes from two properties we lack: it replaces the entire process, and
it does CPU-bound work across thousands of files in parallel. We parse five argv
tokens. There is nothing to parallelise.

Rust remains right for anything that is *its own process doing bulk work*:
`eslint-plugin-cli-floor` as a native oxlint rule, and build-time generators for
completions and the manifest. Not the runtime library.

## 8. What leading CLIs actually use

Dependencies of 30 major CLI tools, resolved 2026-09-06:

| Library | Used by |
| :--- | :--- |
| commander | webpack-cli, netlify-cli, firebase-tools, storybook* |
| yargs | nx, lerna, semantic-release, wrangler* |
| cac | changesets, vite*, vitest* |
| bare parser | npm (nopt), eslint (optionator), astro + rollup (yargs-parser), vercel (arg) |
| native binary / hand-rolled | turbo, biome, esbuild, prettier, tailwindcss, jest, next, tsx |

`*` bundled at build time, so it never appears in `dependencies`.

Two consequences. The "no framework at all" cohort is large and invisible in every
download chart — it is also who `node:util.parseArgs` serves, and it is the
replacement's real market rather than merely our escape hatch. And **our packages must
be bundler-safe**: ESM, no dynamic `require`, no `__dirname` tricks, zero runtime
dependencies. A host that bundles will bundle us too. This is a hard requirement on
`cli-packaging`.

## 9. Reproducing

```bash
# downloads + repo stats
curl -s "https://api.npmjs.org/downloads/point/last-week/commander"
gh api repos/tj/commander.js --jq '[.stargazers_count,.open_issues_count]'

# cold start: 30 spawns per target, median, trivial one-subcommand CLI
for i in $(seq 30); do s=$(date +%s%N); node b-commander.mjs >/dev/null; e=$(date +%s%N); echo $(( (e-s)/1000000 )); done | sort -n | sed -n '16p'
```

```bash
# compat surface
git clone --depth 1 https://github.com/tj/commander.js && \
  grep -rhoE "^\s*(it|test)(\.\w+)?\s*\(" commander.js/test | wc -l

# native vs node startup
for i in $(seq 20); do s=$(date +%s%N); node -e ''; e=$(date +%s%N); echo $(( (e-s)/1000000 )); done | sort -n | sed -n '11p'
```

```bash
# the oracle, end to end
git clone --depth 1 https://github.com/tj/commander.js
cp -r commander.js/tests oracle/ && cd oracle
perl -pi -e "s#from '\.\./index\.js'#from '../impl.js'#g" tests/*.js
echo "export * from 'commander';" > impl.js      # <- the one line to swap
node --test $(grep -l "'../impl.js'" tests/*.js)  # 1210/1215
```
