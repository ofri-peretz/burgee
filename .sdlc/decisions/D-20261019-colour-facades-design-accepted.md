---
id: D-20261019-colour-facades-design-accepted
subject: 'colour-facades: is the Stage 2 design accepted for Build?'
taken: 'Accepted, as re-grounded on main at 326907ec, by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-19'
date: '2026-10-19'
superseded_by: —
---

**Accepted. [`colour-facades/spec.md`](../intents/colour-facades/spec.md), as re-grounded on
`main` at `326907ec`, is the design Build implements, and the intent moves `review → approved`.**
Accepted by the coordinator under the owner's delegation (burgee-owner-delegates-tradeoffs): the
owner delegated Design→Build accepts on 2026-10-12, and the agent that builds the change does not
approve it.

**The design.** `roundel/kleur`, `roundel/colorette` and `roundel/yoctocolors`, each its own
module in `packages/roundel/src/`, each graded level with its incumbent's own suite by
compat-oracle, each bundling at or under its incumbent (a B4 pair at ratio 1), each a `DROP_INS`
row `burgee migrate` writes. Each module carries its incumbent's own formatter and its own
colour rule, kept apart from `roundel/policy`, the split `supports-color-drop-in` and
`roundel/picocolors` already make. One host per pull request, in the compat-oracle lane.

**What the re-grounding changed**, each recorded in the spec's *Re-grounded* section:

- The design said "a thin mapping over `roundel/tokens`". That cannot be built: `roundel/tokens`
  is nine semantic tokens over `util.styleText`, closes and re-opens around every line break, and
  takes its level from `roundel/policy`; the three suites assert exact bytes and their own colour
  rules. Each module is standalone, as `roundel/picocolors` is.
- yoctocolors moved to 2.2.0 since the spec: 61 functions, including the `4:x` underline styles,
  `overline` and the `58;5;n` underline colours, and a suite of 78 cases, one of which spawns
  `fixture.js` from the repository root.
- kleur's suite runs under `uvu -r esm`, and `esm` 3.2.25 does not load an ES module on Node 24
  (measured 2026-10-19: `SyntaxError: Cannot use import statement outside a module`). compat-oracle
  needs a uvu runner with a loader substitution, as it substituted `tsx` for `ts-node/esm`.
- colorette's suite runs under `twist`, which exits 0 with 58 of 67 cases failing against
  colorette itself off a terminal (measured the same day). compat-oracle needs a twist runner that
  reads its counts, and the host needs the environment upstream's CI colours under.
- kleur and colorette ship CommonJS, so their drop-ins must load under `require()`, checked against
  the built package as well as through the oracle's shim.

**Alternatives rejected:** a mapping onto `roundel/picocolors` in `migrate` alone (different
APIs; nothing would grade it), three intents (the same design three times,
D-20261012-colour-facades-one-intent), and one pull request for all three (three oracle runner
changes in one lane).

**Cost accepted.** Three more subpaths on roundel, each a `minor` held by the release window, and
each a column in roundel's capability matrix once graded.
