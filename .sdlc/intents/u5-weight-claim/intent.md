# Intent — U5 is a published claim and it is false

**Status:** shipped · **Opened:** `2026-09-17` · **Owner:** `@ofri-peretz` · **Shipped:** 2026-10-18 on [`1013b65db5`](https://github.com/ofri-peretz/burgee/commit/1013b65db5), verified against `main` at `1013b65db5` — all 1 criteria locked by `npm run bench -- --axis weight --check` and `claim-table-lock.test.ts` · approved and shipped 2026-10-18, accepted under the owner's 2026-10-12 delegation

---

## What is wanted

`burgee/yargs ÷ yargs bundled-bytes-ratio` is at or below **1**, or U5 is restated in public
to say what is true. One of the two. It is not left claiming a property it does not have.

## Why now

The gate's own text is the claim: *"U5, stated as a check: this entry point is no heavier in a
user's bundle than the package it replaces."*

Measured on `main`, 2026-09-17: **1.033**, and **1.038** after N6. It has been false and
getting further from true.

The engine lane measured where the bytes are, and the answer is not fat:

- **Our port of yargs' dependency set is 16.2 KB lighter than yargs'.** `linegauge` at 11,614 B
  replaces emoji-regex + get-east-asian-width + string-width + ansi-styles + wrap-ansi +
  ansi-regex + strip-ansi at 24,880 B. Factory, parser, command, usage, validation and cliui
  are at parity or better.
- The overage is burgee's **own** surface on a yargs program: completions 7,763 · mcp 2,517 ·
  manifest projection 2,403 · plugin 2,393 · schema 2,140 · manifest 1,365 · definition 1,173 ·
  runtime 682 · names + exit-code 248 = **20,714 B**. Every one is a graded behaviour.
- Three hypotheses were tested and two died: root-barrel imports moved **0 bytes**; a dynamic
  import of a known specifier is bundled whole but `completions.js` has no dead exports, so
  making it static saves **195 B**; two sweeps found **zero** unreferenced exports.

So there is no engineering fix of the ordinary kind left to find. What remains are decisions.

## Affected users and systems

`packages/burgee`, `benchmarks/axes/weight.ts`, the published benchmarks page, and any reader
who takes U5 at face value.

## Constraints

- **The measurement is not re-picked to make the claim pass.** Code splitting makes all five
  gates pass and leaves total emitted bytes essentially unchanged (114,482 for yargs); U5's
  words are *"no heavier in a user's bundle"*, and a lazily-loaded chunk is still in the
  user's bundle. Changing the instrument until the number agrees is the move PRINCIPLES
  forbids.
- No graded behaviour is dropped to buy bytes without that being an explicit product decision.

## Success criteria

Either the ratio reads ≤ 1 on CI, or `benchmarks/axes/weight.ts` and the published page state
the restated claim, with the measurement beside it and the date it changed.

## Shipped — 2026-10-18

**Status raised to `shipped`.** Every criterion was checked against `main` at `1013b65db5` in the
roadmap-to-shipped Batch 0 pass (`.sdlc/research/roadmap-to-shipped-2026-10.md`).

Accepted at Design→Build and stamped in one pass, under the owner's 2026-10-12 delegation. The
criterion takes its first branch: the ratio reads ≤ 1 on CI. The open question, whether to drop
`completion <shell>` from `burgee/yargs`, is moot, since nothing needs dropping.

| criterion | check | result |
| :-- | :-- | :-- |
| the ratio ≤ 1 on CI | `burgee/yargs ÷ yargs bundled-bytes-ratio` in every CI reading since `2026-10-06-71c6359-ci.json`, **0.97** on `2026-10-18-56b9262-ci.json`; `npm run bench -- --axis weight --check` | 0 gate failures |
| the gate holds it | `benchmarks/ratchet.test.ts -t "ratio gate"`, `subpath-weight-lock.test.ts -t U5`, `claim-table-lock.test.ts` | 5 passed, 30 skipped; 8 passed, 108 skipped; 4 passed |

The stale 2026-09-17 Verification paragraph in `spec.md` is trimmed in this PR.

## Open questions

**One, and it is the owner's.** The only lever measured is dropping `completion <shell>` from
the yargs front-end, which takes the ratio to **0.962 with 4,177 B to spare**. That is a
product decision about what `burgee/yargs` is — not a weight fix — and it is not one an agent
should take. Recorded here rather than resolved.
