# Design — `replacement-parser`

Intent: [`intent.md`](./intent.md). **Status:** shipped (2026-10-19).

---

## Restated 2026-10-18

**G3 is dropped because `yargs-compat`'s spec contradicts it, G7 reads the D-157 ratchet, and the other five are held on main — SHIPPABLE-AFTER-RESTATE.**

Verified against burgee `main` at `1013b65db5` with `git grep`; no test was run. The full
reasoning is in [`intent.md` § Restated 2026-10-18](./intent.md#restated-2026-10-18).
`cli-core` and `selvage` in the rows below are retired names. The engine is
`packages/burgee/src` and the package is `burgee`. The tree under § Design was never built in
that shape.

| ID | promised | on main | check | disposition |
| :-- | :-- | :-- | :-- | :-- |
| G1 | `defineCommand` tree, parsed by `node:util.parseArgs`, run through the lifecycle | yes (`execute.ts` calls `parseArgs` with `strict: true, tokens: true`) | `examples/conformance/src/harness.test.ts` › "%s · T1 harness" › "runs a command and captures stdout with exit OK"; `packages/burgee/src/parsing-edges.test.ts` › "ctx.exit(code) unwinds with that E1 code and prints nothing — not a runtime failure" | held |
| G2 | every conformance case passes on the third host, no edit to the case | yes, with one declared encoding difference (`ENVELOPE`, `examples/conformance/src/hosts.ts`) | `examples/conformance/src/harness.test.ts` › "%s · T1 harness" › "parses stdout under --json" | restated |
| G3 | opt-in quirk subpaths (camelCase, `-abc`, `--no-`, dot-notation, arrays) | no, by design | none; nothing to hold | dropped by `.sdlc/intents/yargs-compat/spec.md` § Rejected alternatives ("A shared "quirks" module for both hosts") |
| G4 | core entry pulls zero bytes of any quirk or front-end | yes: no quirk module exists; entry `.` imports only `closeout` and `seniority/precedence`, in 35,681 B | `packages/burgee/src/weight.test.ts` › "entry %s" › "imports only what its rule allows"; › "stays inside its byte budget" | restated (quirk half moot) |
| G5 | `-` is stdin for file positionals; `--` pass-through survives | yes; the tail reaches the handler verbatim as `passthrough`, and spawning it is the handler's job | `packages/burgee/src/stdin-dash.test.ts` › "hands the handler the injected stdin, and the positional still reads `-`"; `packages/burgee/src/parsing-edges.test.ts` › "commander #2530, yargs #1527 — `--` ends options and everything after it survives verbatim" | held |
| G6 | ≥ 6 §10 issues fixed, each test citing the issue | yes, seven | `packages/burgee/src/parsing-edges.test.ts` › "§10 parsing edges, by upstream issue" | held |
| G7 | cold start within 2 ms of bare `parseArgs` | no: 13.39 ms above bare node against cac's 2.78 ms (2026-10-12 CI) | `benchmarks/ratchet.test.ts` › "cold-start-at-or-below-cac: the claim and the B2 gate read the same ceiling, and it fires over it"; `scripts/claim-ratchets-lock.test.ts` › "%s only goes down, or cites a newer decision to go up" | restated by D-157 (ceiling 1.55 in `.sdlc/bands/claim-ratchets.json`) |

Label collision to know about: `parsing-edges.test.ts` has a block named
"an unknown option says what was meant (G7)". It is the nearest-option suggestion, not this
spec's G7 (cold start).

## Requirements

| id | Requirement |
| :-- | :-- |
| G1 | `defineCommand` declares a command tree; `cli-core` parses it with `node:util.parseArgs` and runs it through the existing lifecycle (E4) |
| G2 | Every conformance case passes on the third host with no edit to the case |
| G3 | ~~Host quirks (camelCase, `-abc` bundling, `--no-` negation, dot-notation, array accumulation) are opt-in behaviours, each separately importable~~ **Dropped 2026-10-18:** contradicted by `yargs-compat/spec.md` § Rejected alternatives; the host grammars live whole in the façades |
| G4 | The core entry point pulls zero bytes of any quirk or front-end (asserted by B4) |
| G5 | `-` means stdin for file positionals; `--` pass-through survives to child processes (S4, §10) |
| G6 | Six or more §10 issues open upstream are fixed, each with a test citing the issue |
| G7 | ~~Cold start within 2ms of bare `node:util.parseArgs` (B2)~~ **Restated 2026-10-18 (D-157):** `burgee ÷ cac` cold start at or below the downward-only ceiling in `.sdlc/bands/claim-ratchets.json` (1.55) |

## Status — 2026-09-07

| | |
| :-- | :-- |
| G1 | ✅ `defineCommand` / `defineProgram`; `run()` is a thin wrapper over `execute()` — one path from argv to exit |
| G2 | ✅ `demo-cli-burgee` is the third conformance host, through `runBurgee` (T1 for burgee itself). Env binding is minimal V2 so the env case passes. **One declared difference:** burgee's `--json` is the O1 envelope; the case asserts `{ ok, data }` for burgee and the raw record for the incumbents, because the same data arrives in two encodings |
| G3 | ⏳ quirks land with the front-ends in wave 2 (dropped 2026-10-18: they never did, by `yargs-compat`'s design) |
| G4 | ✅ the weight lock |
| G5 | ✅ `passthrough` after `--`, verbatim; `-` is a positional |
| G6 | ✅ seven cited: yargs #1312, commander #2530 / yargs #1527, yargs #1821 / #2423, citty #41 / #253, citty #237, yargs #1324 / #2416, citty #201 — `parsing-edges.test.ts` |
| G7 | ✅ measured: a full burgee run is **+5 ms** over bare node, the same as `parseArgs` alone (+5 ms); the parser dominates and burgee adds nothing measurable. `cli-benchmarks` B2 owns the recurring measurement |

Found on the way: a handler had no way to exit with an E1 code, and would have been
reported as a runtime failure if it tried; root and group `--help` did not exist. Both fixed
and tested.

## Design

```
packages/cli-core/src/
  parse/
    tokens.ts        # thin wrapper over node:util.parseArgs
    resolve.ts       # argv -> command node (subcommands, positionals, --)
    apply.ts         # schema coercion, relations, precedence (reuses commander-schema/env logic)
    quirks/
      camel-case.ts       # opt-in, one export each (G3)
      bundled-shorts.ts
      negation.ts
      dot-notation.ts
      array-accumulate.ts
  define.ts          # defineCommand public API
```

`node:util.parseArgs` handles tokenising only. Everything above it — subcommand
resolution, schema coercion, relations, precedence, provenance, help data — already
exists in `cli-core` because the layer packages needed it against commander and yargs.
That is the whole argument for building this last: the parser is the small part, and it
arrives into a finished machine.

**Quirks are exports, not flags** (G3, and §6 of the competitor map). A `quirks: [...]`
runtime option would ship every quirk to every user. Instead:

```ts
import { defineCommand } from 'selvage';
import { camelCase } from 'selvage/quirks/camel-case';

defineCommand({ /* … */ }, { behaviours: [camelCase] });
```

A user who never imports a quirk never bundles it, and B4 asserts that mechanically
rather than trusting it.

**Order of work.** Tokens and subcommand resolution first, graded by the conformance
suite with everything else stubbed — the suite is the spec, so it should be failing
loudly from commit one. Then coercion and relations. Then quirks, one per commit, each
with the B4 fixture proving it stays out of the core bundle. Then the §10 issue fixes,
each citing its upstream number. `compat-oracle` is not involved here: it grades the
front-ends, which are separate intents.

## Verification

`npm test` runs the conformance suite against three hosts; `npm run bench -- --axis perf`
and `--axis weight` enforce G7 and G4.

Proven-red, per rule 4: before any parser code exists, the third host is registered in
`examples/conformance/src/hosts.ts` and every case fails. The commit that adds the host
must show a red suite; the intent is only done when the same unedited suite is green.

## Rejected alternatives

- **Build the parser first.** One of nine issue clusters, already solved twice for free,
  and stricli proves a parser with no floor earns 16 downloads a week.
- **A hand-written lexer.** `parseArgs` is in stdlib, is maintained by Node, and costs
  +2ms. Writing our own would add the one component with no differentiation and a long
  tail of edge cases already fixed upstream.
- **Runtime `quirks` configuration.** Ships every byte to every user and declines to
  execute most of them — the exact trap §6 of the competitor map describes.
- **A separate package rather than living in `cli-core`.** The parser needs the schema,
  precedence and help data that already sit in the core; splitting them would mean a
  circular dependency or a duplicated model.

## Out of scope

- The compat front-ends — `commander-compat` and `yargs-compat` are their own intents.
- Deprecating or discouraging the layer packages. They remain the recommended entry for
  anyone already on a host; this adds an option, it does not remove one.
- Non-Node runtimes (Deno, Bun). `parseArgs` exists in both, but claiming support means
  testing it, and that is a separate intent with its own matrix.
