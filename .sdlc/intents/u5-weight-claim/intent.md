# Intent — U5 is a published claim and it is false

**Status:** review · **Opened:** `2026-09-17` · **Owner:** `@ofri-peretz`

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

## Open questions

**One, and it is the owner's.** The only lever measured is dropping `completion <shell>` from
the yargs front-end, which takes the ratio to **0.962 with 4,177 B to spare**. That is a
product decision about what `burgee/yargs` is — not a weight fix — and it is not one an agent
should take. Recorded here rather than resolved.
