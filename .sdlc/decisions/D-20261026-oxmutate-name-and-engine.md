---
id: D-20261026-oxmutate-name-and-engine
subject: 'oxmutate: what is the package called, and which engine does it run on?'
taken: 'Taken — by the owner, 2026-10-26'
date: '2026-10-26'
superseded_by: —
---

**The name is `oxmutate`, reserved on npm on 2026-10-26 (`0.0.0`, maintainer `ofriperetz`), and the
engine is oxc** (its parser, AST and codegen; `oxc-parser` in M0, the Rust crates from M1).

**Why the name.** It follows the oxc tool pattern, `ox` + verb (`oxlint`, `oxfmt`), so a developer
who knows those reads it as the oxc mutation tool. `oxmut` was taken (a 2016 placeholder);
`oxc-*` names all belong to the oxc project and would read as official; a Stryker-like name would
borrow the incumbent's brand.

**Why not "Vite+" as the engine.** Vite+ fronts its tools with `vp` verbs and documents no
third-party subcommands (alpha announcement), so `oxmutate` runs as `vpx oxmutate` beside `vp test`.
A `vp mutate` slot is a conversation with VoidZero, not a dependency.

**Affiliation.** Until the oxc team says otherwise the README states "community project, built on
oxc, not affiliated with the oxc project". Contact them after M0's numbers; rename before 1.0 if
they object.
