# Intent — `replacement-parser`: our own parser, as a third adapter

> Stage 1 artifact. Child of [`agent-native-cli-layer`](../agent-native-cli-layer/intent.md).
> The point at which the layer stops renting distribution and owns its own host.

**Status:** review · **Opened:** `2026-09-06` · **Owner:** `@ofri-peretz`

---

## What is wanted

A parser inside `cli-core`, built over `node:util.parseArgs`, that the existing
conformance suite passes against exactly as it passes against commander and yargs. At
that point `cli-core` is a complete CLI framework and the host packages become
optional, without a single line of a user's code changing shape.

Working package name `banneret` (verified free on npm 2026-09-06, alongside `treadle`
and `sley`). Provisional until the first publish.

## Why now

Not now — this is deliberately last, and the reason is recorded so it is not
relitigated. From `docs/research/competitor-landscape.md`:

- **Parsing is one cluster of nine.** Of the 329 open issues read across five trackers,
  exactly one is about parsing argv. Building the parser first would deliver the only
  part that is already solved twice, for free, and shipped in the Node standard library.
- **A parser alone is worth nothing to a user.** stricli is zero-dependency, fully
  typed, better designed than commander, and does 16 downloads a week. Compatibility
  gets a replacement considered; the floor is what gets it chosen.
- **It is cheap once the floor exists.** `node:util.parseArgs` costs +2ms over bare node
  against commander's +16ms, ships in stdlib with zero dependencies, and the acceptance
  tests are already written — the conformance suite plus `compat-oracle`.

What makes it *worth* doing at all: §10 of the issue research (parsing edge cases) is
the one cluster currently marked "not planned, commander owns it". Owning the parser
converts that cluster from a permanent dependency into a fixable backlog: `-` as stdin,
`--` pass-through to executables, `-foo=bar`, quotes, strict-mode gaps, positional
equal to a subcommand name.

## Affected users and systems

- `packages/cli-core` gains `parse/`, and a `defineCommand` public API.
- The conformance suite gains a third host; every existing case must pass unchanged.
- `cli-benchmarks` B2 gains a `replacement` row; B4 gains `core` as its own entry point.
- No existing package changes its public surface. That is the test.

## Constraints

1. **`node:util.parseArgs` does the tokenising.** We add semantics, not a lexer. If a
   behaviour needs a different lexer, it is a C4 divergence with a written reason.
2. **Zero runtime dependencies** (K1), ESM only, Node ≥ 24 (K2).
3. **The core entry point carries no host quirks.** camelCase conversion, `-abc`
   bundling and `--no-` negation are opt-in behaviours, importable individually, and a
   fixture importing only the core must pull zero bytes of them (B4).
4. **The conformance suite is not edited to accommodate the parser.** Rule 2: never edit
   the test to make it pass. A case that cannot pass is a design defect or a recorded
   divergence, never a test change.
5. Cold start must land within 2ms of bare `node:util.parseArgs`, measured by B2.

## Success criteria

1. Every conformance case passes on all three hosts, unchanged.
2. B2 shows the replacement at or below cac's cold start.
3. B4 shows the core entry point under 52KB bundled.
4. At least six §10 parsing issues that commander or yargs has open are demonstrably
   fixed, each with a test citing the issue number.
5. A user swapping `commander` for `banneret/commander` changes one import line and their
   tests still pass — verified by running `examples/demo-cli-commander` against both.

## Open questions

None open. Decided at finalisation (2026-09-06): build it last, not first, for the three
reasons above; `parseArgs` rather than a hand-written lexer, because the commodity part
should stay commodity; and the name stays provisional until publish, because the trigger
for publishing is adoption of the layer, not readiness of the parser.
