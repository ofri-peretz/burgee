# Design — `replacement-parser`

Intent: [`intent.md`](./intent.md). **Status:** review.

---

## Requirements

| id | Requirement |
| :-- | :-- |
| G1 | `defineCommand` declares a command tree; `cli-core` parses it with `node:util.parseArgs` and runs it through the existing lifecycle (E4) |
| G2 | Every conformance case passes on the third host with no edit to the case |
| G3 | Host quirks (camelCase, `-abc` bundling, `--no-` negation, dot-notation, array accumulation) are opt-in behaviours, each separately importable |
| G4 | The core entry point pulls zero bytes of any quirk or front-end (asserted by B4) |
| G5 | `-` means stdin for file positionals; `--` pass-through survives to child processes (S4, §10) |
| G6 | Six or more §10 issues open upstream are fixed, each with a test citing the issue |
| G7 | Cold start within 2ms of bare `node:util.parseArgs` (B2) |

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
