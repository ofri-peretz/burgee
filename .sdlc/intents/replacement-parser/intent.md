# Intent — `replacement-parser`: our own parser, as a third adapter

> Stage 1 artifact. Child of [`burgee`](../burgee/intent.md).
> The point at which the layer stops renting distribution and owns its own host.

**Status:** review · **Opened:** `2026-09-06` · **Owner:** `@ofri-peretz`

**State assigned 2026-09-09** from repo evidence, at the owner’s direction. **Why still `review`:** the engine, lifecycle, exit contract, manifest and four locks are in the repo — but **`burgee/quirks/*` (G3) has no export**, so the intent is not complete.

**Restated:** 2026-10-18 — see § Restated 2026-10-18

---

## Restated 2026-10-18

**Every criterion is on main with a check once G3 is recorded as dropped and #2 / G7 read the D-157 ratchet — SHIPPABLE-AFTER-RESTATE.**

Verified against burgee `main` at `1013b65db5` with `git grep`; no test was run for this
restatement. No criterion is renumbered: `benchmarks/claims.ts` cites
`replacement-parser/intent.md #2` (claim `cold-start-at-or-below-cac`) and `#3` (claim
`core-under-52kb-bundled`) by number. The spec's G rows are restated in
[`spec.md` § Restated 2026-10-18](./spec.md#restated-2026-10-18).

What changed, and why:

- **#2 (and spec G7, constraint 5): ≤ 1× cac is restated to the D-157 ratchet.** The old
  criterion asked for burgee's cold start at or below cac's, and constraint 5 asked for
  burgee within 2 ms of bare `node:util.parseArgs`. Neither is met, and D-102 records why the
  floor is structural. `.sdlc/decisions/D-157.md` (2026-09-27) makes the published claim a
  downward-only ratchet. The ceiling is in `.sdlc/bands/claim-ratchets.json`
  (`cold-start-at-or-below-cac`): 1.6 at first, lowered to **1.55** on 2026-10-11 under
  D-157. The ten CI readings on 2026-10-18 in `benchmarks/results/cli-benchmarks/*-ci.json`
  are 1.369 to 1.472. At the 2026-10-12 reading (`2026-10-12-d8569f5-ci.json`) burgee
  starts 13.39 ms above the bare-node floor and cac 2.78 ms, so the 2 ms bound of constraint
  5 is far off. It is gated the same way as #2, not separately. ≤ 1 stays the aspiration and
  is no longer the gate.
- **G3 (opt-in quirk subpaths) is dropped, contradicted by `yargs-compat`.** The spec
  promised `selvage/quirks/*`: camelCase, `-abc` bundling, `--no-` negation, dot-notation and
  array accumulation, each importable on its own. `.sdlc/intents/yargs-compat/spec.md`
  § Rejected alternatives rejects that module in so many words: "A shared "quirks" module for
  both hosts (the first draft of this design)", because commander's and yargs' grammars
  differ in exactly what the suites assert, so "sharing would couple two specifications.
  Both ports stand alone". `commander-compat/spec.md` § Rejected alternatives says the same.
  The host grammars therefore live whole inside `burgee/commander` and `burgee/yargs`. The
  native engine bakes in `--no-` negation, because precedence needs every boolean to be
  negatable (`packages/burgee/src/execute.ts`, `toParseConfig`). It also bakes in
  kebab-on-the-CLI and camelCase keys. Constraint 3 is annotated to match.
- **#1: "unchanged" is restated to "unchanged, with one declared encoding difference".**
  `examples/conformance/src/hosts.ts` declares `ENVELOPE = new Set(['burgee'])`, and
  `harness.test.ts` asserts `{ ok, data }` for the native host and the raw record for the
  incumbents. It is the same datum in two encodings. It is one per-host expectation in one
  case (`parses stdout under --json`), declared by name in `hosts.ts`, and every other case
  is identical across hosts. Constraint 4 forbids editing a case to fit the parser. This
  restatement records the reading under which this one passes: a declared encoding difference
  is not a weakened assertion. The owner accepts that reading at Design→Build or rejects it.
- **#5 and § Affected: `selvage` and `cli-core` are retired names.** The package is `burgee`,
  the front-end is the `burgee/commander` subpath, and the engine lives in
  `packages/burgee/src`.

| ID | promised | on main | check | disposition |
| :-- | :-- | :-- | :-- | :-- |
| 1 | every conformance case passes on all three hosts, unchanged | yes, five host entries; one declared envelope difference | `examples/conformance/src/harness.test.ts` › "%s · T1 harness" (all eleven cases per host, `burgee` included) | restated |
| 2 | B2: burgee at or below cac's cold start | ≤ 1 not met; ≤ 1.55 met (1.369–1.472 on 2026-10-18 CI) | `benchmarks/ratchet.test.ts` › "D-157 claim ratchets — the gate is the claim" › "cold-start-at-or-below-cac: the claim and the B2 gate read the same ceiling, and it fires over it"; `scripts/claim-ratchets-lock.test.ts` › "the claim ratchets" › "%s only goes down, or cites a newer decision to go up"; `scripts/claim-table-lock.test.ts` › "never marks a claim met that the newest CI measurement of it does not satisfy" | restated by D-157 |
| 3 | B4: core entry under 52 KB bundled | yes: entry `.` budget 35,681 B (graph); 23,905 B bundled at the 2026-10-12 CI reading | `packages/burgee/src/weight.test.ts` › "entry %s" › "stays inside its byte budget"; `scripts/claim-table-lock.test.ts` › "never marks a claim met that the newest CI measurement of it does not satisfy" (claim `core-under-52kb-bundled`) | held |
| 4 | ≥ 6 §10 issues fixed, each test citing the issue | yes, seven | `packages/burgee/src/parsing-edges.test.ts` › "§10 parsing edges, by upstream issue" (seven `it`s, from "yargs #1312 — a lone dash is a positional (stdin by convention), never an error" to "citty #201 — an unknown option is USAGE (2), never RUNTIME (1)") | held |
| 5 | swapping `commander` for ~~`selvage/commander`~~ `burgee/commander` is one import line | yes | `examples/conformance/src/commander-parity.test.ts` › "X7 · burgee/commander is byte-identical to commander on the demo"; `examples/demo-cli-commander/src/burgee.ts` swaps only the import | restated (name) |
| C3 | no host quirks in core; negation, camelCase, bundling opt-in | negation and kebab/camel are core by design; host grammars are in the façades | `packages/burgee/src/env.test.ts` › "--dry-run, --no-color and --target-env, not the camelCase keys" | dropped by `yargs-compat` spec § Rejected alternatives |
| C5 | cold start within 2 ms of bare `parseArgs` | no (13.39 ms above bare node, 2026-10-12 CI) | as #2 | restated by D-157 |

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
3. ~~**The core entry point carries no host quirks.** camelCase conversion, `-abc`
   bundling and `--no-` negation are opt-in behaviours, importable individually, and a
   fixture importing only the core must pull zero bytes of them (B4).~~ **Restated
   2026-10-18:** the core entry carries no **host front-end**. `--no-` negation and
   kebab↔camel are the native engine's own grammar, required by precedence. The host
   grammars live whole in `burgee/commander` and `burgee/yargs`, and no quirk module exists
   (G3 dropped, `yargs-compat/spec.md` § Rejected alternatives). Held by
   `packages/burgee/src/weight.test.ts` › "entry %s" › "imports only what its rule allows"
   (entry `.`: `closeout` and `seniority/precedence` only).
4. **The conformance suite is not edited to accommodate the parser.** Rule 2: never edit
   the test to make it pass. A case that cannot pass is a design defect or a recorded
   divergence, never a test change.
5. ~~Cold start must land within 2ms of bare `node:util.parseArgs`, measured by B2.~~
   **Restated 2026-10-18:** gated with #2, as the D-157 ratchet on `burgee ÷ cac`.

## Success criteria

1. Every conformance case passes on all three hosts, unchanged. **Restated 2026-10-18:**
   unchanged except the one declared encoding difference (`ENVELOPE` in
   `examples/conformance/src/hosts.ts`); held by `examples/conformance/src/harness.test.ts`
   › "%s · T1 harness".
2. ~~B2 shows the replacement at or below cac's cold start.~~ **Restated 2026-10-18
   (D-157):** B2 shows `burgee ÷ cac` at or below the downward-only ceiling in
   `.sdlc/bands/claim-ratchets.json` (`cold-start-at-or-below-cac`, 1.55 since 2026-10-11).
   ≤ 1 stays the aspiration. Held by `benchmarks/ratchet.test.ts` ›
   "cold-start-at-or-below-cac: the claim and the B2 gate read the same ceiling, and it fires
   over it" and `scripts/claim-ratchets-lock.test.ts`.
3. B4 shows the core entry point under 52KB bundled. **Held 2026-10-18:** entry `.` budget
   35,681 B in `packages/burgee/src/weight.test.ts`.
4. At least six §10 parsing issues that commander or yargs has open are demonstrably
   fixed, each with a test citing the issue number.
5. A user swapping `commander` for ~~`selvage/commander`~~ `burgee/commander` (restated
   2026-10-18: there is no `selvage`) changes one import line and their
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
  above 1 — not because nobody has looked. Since D-157 (2026-09-27) the owner has restated the
  gate as a downward-only ratchet at 1.55× cac, set from 26 CI runs; ≤ 1 stays this
  criterion's target, and the claim now publishes what is gated.
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
