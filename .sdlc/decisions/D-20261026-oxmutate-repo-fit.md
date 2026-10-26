---
id: D-20261026-oxmutate-repo-fit
subject: 'oxmutate: does a mutation-testing tool belong in burgee, a repository whose mission is a CLI framework?'
taken: 'Taken — by the owner, 2026-10-25 and 2026-10-26'
date: '2026-10-26'
superseded_by: —
---

**Yes. `oxmutate` lives in burgee by design.** The owner's reasoning (2026-10-26): burgee is the
one monorepo for JS/TS tooling, the same shape as Vite+ (one toolchain, many tools), and the bet
is a complementary JS/TS ecosystem built from the quality layer up (lint rules, CLI framework,
mutation testing) beside VoidZero's engine layer (parser, bundler, runner).

**What it costs.** The intents index and roadmap describe a CLI family; `oxmutate` is the first
member that is not a CLI concern. The package-map, docs-site and weight locks will need a row when
`packages/oxmutate` lands (M1), the same as any new package.

**Reversal.** The intent, spec and plan are written so the layout moves to its own repository
unchanged.
