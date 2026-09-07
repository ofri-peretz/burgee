# The competitor map, and why we are a layer before we are a framework

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

## 5. The resolution: the framework is a third adapter, not a fork

The two options are usually posed as a choice. They are a sequence.

```
cli-core  (host-neutral: exit codes, envelope, manifest, precedence, help data)
   ├── commander-agent   ← distribution today (508M/wk host)
   ├── yargs-agent       ← distribution today (259M/wk host) + portability proof
   └── <framework>       ← a third adapter over node:util.parseArgs, later
```

The standalone framework is not a rewrite and not a competitor built from zero. It is
an adapter over `node:util.parseArgs` — stdlib, zero dependencies, **+2ms**, the
fastest row in the table — exposing the *same* public API the layer packages already
expose. Consequences:

- It is a few hundred lines, not a product bet, because the 95% that is not parsing
  was built and shipped first.
- Its test suite already exists: the conformance suite, third host added.
- Migration for an existing user is a one-line import change, not a rewrite.
- We arrive with an installed base instead of arriving at stricli's 16.

**We rely on commander for distribution, never for capability.** If commander stalls
or breaks, the third adapter ships and our users' code does not change.

### Trigger, so this is not vaporware

Build the third adapter when **either** holds:

- combined `commander-agent` + `yargs-agent` downloads clear **50k/wk**, or
- **2027-09-06** arrives and the layer packages are alive but the hosts are blocking
  a floor requirement we cannot implement through public APIs.

Until one fires, every hour spent on a parser is an hour not spent on the vacancy.

Names reserved for it (verified free 2026-09-06): `burgee`, `treadle`, `sley`.
Worth publishing a placeholder to hold one; the choice itself can wait for the trigger.

## 6. Reproducing

```bash
# downloads + repo stats
curl -s "https://api.npmjs.org/downloads/point/last-week/commander"
gh api repos/tj/commander.js --jq '[.stargazers_count,.open_issues_count]'

# cold start: 30 spawns per target, median, trivial one-subcommand CLI
for i in $(seq 30); do s=$(date +%s%N); node b-commander.mjs >/dev/null; e=$(date +%s%N); echo $(( (e-s)/1000000 )); done | sort -n | sed -n '16p'
```
