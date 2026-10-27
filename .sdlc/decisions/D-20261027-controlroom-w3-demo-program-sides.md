---
id: D-20261027-controlroom-w3-demo-program-sides
subject: 'W3''s demo half compares the reference dashboard with the Ink screen fixture — two programs, not two entry points. How does B4, whose sides are one import and a symbol, measure a whole program, and what is the bar?'
taken: 'Taken by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-27, in feat/controlroom-close'
date: '2026-10-27'
superseded_by: —
---

**A `Side` may name a `program`: a repo-relative file whose source is the fixture. The pair
`controlroom/dashboard` bundles `examples/dashboard/dashboard.mjs` against
`examples/dashboard-ink/screen.mjs`, both written into B4's scratch directory under `benchmarks/`
and resolved from there, with no peer aliases. The ratio is gated at 1.0, U5's bar and the
intent's; the claim is `controlroom-dashboard-lighter-than-ink-screen`.**

**Why the program's own source.** The intent's W3 compares "the reference demo" with "the Ink
screen fixture". A generated fixture that imports `open` and `render` would measure the two
libraries again — W3's root half already does that (0.063). What the demo half adds is the
whole program a user ships, with every subpath it reaches: the dashboard's `flagstaff/tasks`,
`log-tail`, `tab-bar`, `progress` and `plugin`, and the fixture's `@inkjs/ui` and React.

**Why resolved from `benchmarks/`, and why no aliases.** The fixture's own directory resolves
`'ink'` to its shim, which is `controlroom/ink`: bundled where it stands, the incumbent side would
be the drop-in. Copied into the scratch directory it resolves `ink` 8.0.0, `react` 19.3.0 and
`@inkjs/ui` 2.0.0 from benchmarks' own manifest, as every other fixture does. `peerAliases` is not
applied: it aliases a peer to its package directory, and `@inkjs/ui`, `ink` and `flagstaff` have
no `main`, only `exports`, so a directory alias cannot resolve them; and neither program has the
nested-copy hazard the aliases exist for.

**The side's label is its path**, so the ratio row reads
`examples/dashboard/dashboard.mjs ÷ examples/dashboard-ink/screen.mjs` and no row written before
it changes name. `specifier` and `with` still name the packages each program imports, for the
version on the row and the installed tree (reported, not gated).

**Measured 2026-10-27 on darwin** (`bundle()` of both sides, Node 24.12.0): 48,402 B against
730,210 B, a ratio of 0.066. **Failing first:** `ratchet.test.ts` drives the gate with synthetic
bytes and sees it exit 1 at 1,001 against 1,000 and 0 at parity, before any measurement exists.
The record publishes on `/docs/benchmarks` with the first CI bench run after this merges.
