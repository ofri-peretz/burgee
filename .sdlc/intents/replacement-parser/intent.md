# Intent — `replacement-parser`: our own parser, as a third adapter

> Stage 1 artifact. Child of [`agent-native-cli-layer`](../agent-native-cli-layer/intent.md).
> The point at which the layer stops renting distribution and owns its own host.

**Status:** review · **Opened:** `2026-09-06` · **Owner:** `@ofri-peretz`

**State assigned 2026-09-09** from repo evidence, at the owner’s direction. **Why still `review`:** the engine, lifecycle, exit contract, manifest and four locks are in the repo — but **`burgee/quirks/*` (G3) has no export**, so the intent is not complete.

---

## What is wanted

A parser inside `cli-core`, built over `node:util.parseArgs`, that the existing
conformance suite passes against exactly as it passes against commander and yargs. At
that point `cli-core` is a complete CLI framework and the host packages become
optional, without a single line of a user's code changing shape.

Working package name `selvage` (verified free on npm 2026-09-06, alongside `treadle`
and `sley`). Provisional until the first publish.

## Why now

Not now — this is deliberately last, and the reason is recorded so it is not
relitigated. From `.sdlc/research/competitor-landscape.md`:

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
5. A user swapping `commander` for `selvage/commander` changes one import line and their
   tests still pass — verified by running `examples/demo-cli-commander` against both.

## Verified against `main` — 2026-09-09

Checked criterion by criterion on `61bd11b9`. **Three of five met.** The status stays `review`.

- **Every conformance case passes on all three hosts, unchanged** — met, with one caveat worth
  recording. `examples/conformance` is **122 / 122** across five host entries (`commander`,
  `burgee-commander`, `yargs`, `burgee-yargs`, `burgee`). The caveat: `src/hosts.ts:21` declares
  `ENVELOPE = new Set(['burgee'])`, used at `harness.test.ts:49` to expect a different `--json`
  shape for the native host. That is an accommodation in the suite for the third host, which
  constraint 4 forbids. It is documented honestly in the file, but it is an edit, and the
  `burgee` host entry arrived in the same commit as the engine — so the suite was never a
  pre-existing fixed target for it.
- **B2 shows the replacement at or below cac's cold start** — **not met**, and now for the
  right reason. That verification was written against `61bd11b9`, where the sentence "no
  cold-start measurement of any kind exists in the repo" was true; on the `cli-benchmarks`
  branch it is not. B2 measures it, `claims.ts` names this criterion's line as the source
  file for `cold-start-at-or-below-cac`, and the measured ratio is on the generated
  benchmarks page. The criterion is unmet because the number says so — `burgee ÷ cac` is
  above 1 — not because nobody has looked.
- **B4 shows the core entry point under 52 KB bundled** — met, though by a lock rather than by
  the benchmark axis the criterion names. `packages/burgee/src/weight.test.ts:80` budgets `'.'`
  at 52,000 B; the measured graph is **51,921 B** and the test passes.
- **At least six §10 parsing issues fixed, each with a test citing the issue** — **met.**
  `packages/burgee/src/parsing-edges.test.ts` carries seven passing tests citing yargs #1312,
  #1527, #1821, #2423, #1324, #2416 and commander #2530, all of which appear in §10 of
  `competitor-open-issues.md`.
- **Swapping commander for the front-end changes one import line** — met.
  `examples/demo-cli-commander/src/burgee.ts` swaps only the import and feeds the unchanged
  `program.ts`; `commander-parity.test.ts` runs 29 cases byte-for-byte against real commander.

**Stale vocabulary.** This file still says `selvage/commander`. There is no `selvage`; the
package is `burgee`, the front-end is the `./commander` subpath, and the target is declared per
host in `packages/compat-oracle/src/hosts.ts` rather than by a `COMPAT_TARGET` env var.

## Open questions

None open. Decided at finalisation (2026-09-06): build it last, not first, for the three
reasons above; `parseArgs` rather than a hand-written lexer, because the commodity part
should stay commodity; and the name stays provisional until publish, because the trigger
for publishing is adoption of the layer, not readiness of the parser.
