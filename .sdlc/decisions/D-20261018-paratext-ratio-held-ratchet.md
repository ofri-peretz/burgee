---
id: D-20261018-paratext-ratio-held-ratchet
subject: 'paratext R11: is the bundled ratio over `ansi-escapes` (1.65 ratchet, 1.632 measured on 2026-10-18) acceptable as product, so the intent can ship?'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets and trade-offs, applied by the roadmap-to-shipped program of 2026-10-18'
date: '2026-10-18'
superseded_by: —
---

**Accepted as a held ratchet, the way closeout's two drop-in ratios are held. R11 is met as
written, and paratext ships with the number stated.**

R11 asks for "a ceiling in `.sdlc/bands/foundation-ceilings.json`, and a B4 benchmark row". Both
exist. The open question was never whether R11 was built. It was whether a layer that bundles
heavier than one of its incumbents can be called shipped.

**The numbers.**

- **D1 ceiling** (`foundation-ceilings.json`): paratext's tarball is 119,333 B against the 2,235,987 B
  of the three incumbents it ships graded drop-ins for (`ansi-escapes`, `terminal-link`, `term-img`).
  That is a ratio of **0.0534**. The layer is lighter installed than what it replaces.
- **B4 bundled row** (`benchmarks/axes/weight.ts`, `RATIO_CEILING.paratext`): `paratext` against
  `ansi-escapes` 7.3.0 was (7,086 + 80) / 4,351 = 1.647 when it was ratcheted at **1.65** on
  2026-09-30, and read **1.632** in `npm run bench -- --axis weight --check` on 2026-10-18.
  D-138 made the comparison like for like: both sides carry the same thirty-one members. What
  remains is the capability registry that makes the OSC half degrade to a static fallback on a pipe.
  That registry is paratext's product. `ansi-escapes` writes the sequence whether or not the terminal
  understands it.

**Why accept it.** D-157 is the owner's rule for a published claim whose measured floor sits above
≤ 1. It becomes "something acceptable and realistic, while we consistently keep them as low as we
can": a ceiling just above the measurement, gated on every run, lowered and never raised. The ratio
row already follows that rule, and `weight.ts` says plainly beside it that the claim is not met.
closeout's `closeout/exit-hook` (2.98) and `closeout/signal-exit` (1.31) are held the same way.
D-20261012-closeout-drop-ins-held-to-u5 decided those drop-ins must still come down, and
closeout-at-incumbent-weight is queued to do it. paratext gets no such intent. Unlike an
`overrides` drop-in, a caller of `paratext` asks for capability detection, so the registry bytes
buy behaviour the caller asked for.

**What holds it.** `npm run bench -- --axis weight --check`, which fails a PR that moves the row
above 1.65. `packages/paratext/src/weight.test.ts`, which holds `ours` to the ceilings file.
`scripts/foundation-ceilings-lock.test.ts`.

**How to reverse.** Open an intent to reach ≤ 1 against `ansi-escapes`. The measured route would be
a registry-free `paratext/ansi-escapes` subpath that matches the incumbent's semantics exactly.
Then lower the ratchet as each PR lands.
