---
id: D-20261025-brand-burgee-dropped
subject: 'brand-burgee: dropped here — D-043 places a brand generator in interlace, and what shipped in burgee/brand is frozen as built'
taken: 'Taken — on the owner''s delegation of 2026-10-12, applied by the roadmap-to-shipped program (batch 28), 2026-10-25'
date: '2026-10-25'
superseded_by: —
---

**Dropped in this repository. The draft never had a design. Its own first open question was
answered by [D-043](./D-043.md): a brand generator belongs in `interlace`, and this repository is
the wrong home.**

The intent asked for any project to declare two colours and get a favicon, a raster set, an OG
card and theme variants. It was built ahead of its gate. `burgee brand`, the `burgee/brand` and
`burgee/contrast` subpaths, and `npm run brand:check` shipped with no `spec.md`. Its tracker row
asked for a spec to be written.

**Why drop rather than write the spec.**

- **D-043 already ruled on the home.** "It shares the 'one declaration, many projections' thesis
  and nothing else — not argv, not the manifest — and rule 10 is one repo per family." Writing an
  accepted design for it here would contradict that ruling.
- **PRINCIPLES 14, single responsibility.** A CLI framework that owns favicon geometry has two
  concerns. `burgee/spec.md` already flags the two subpaths as rows that "will surprise a reader
  of the requirements".
- **The open criteria are brand-tool work, not CLI work.** They are the generated OG card,
  legibility of an unrelated two-colour pair at 16, 32 and 512 px, and the cold-start half. None of
  them moves a CLI author or an agent, and every one of them would add to what burgee maintains.

**What stays, frozen as built.** `burgee brand` and the `burgee/brand` and `burgee/contrast`
subpaths are published API, so removing them is a breaking change and needs a major version. They
stay as they are (`brandCommand` in `packages/burgee/src/program.ts`), held by
`packages/burgee/src/brand.test.ts` and `brand-edges.test.ts`, which run with the package's
suite. This repository's six brand surfaces stay generated from that code. `npm run brand:check`
compares them, and it runs inside `npm run lint`, which no workflow runs as a whole (quality.yml
runs `lint:md` and `lint:workflows` separately). The intent recorded that gap, and dropping the
intent leaves it as it was. No new feature lands here.

**What covers it instead.** Nothing in this repository. The generator's future is an
`interlace` intent, per D-043. Moving or deprecating the two subpaths is decided at burgee's next
major version.

**How to reopen.** Only if `interlace` declines the generator and a burgee adopter asks for a mark
from their CLI's own declaration. Then it comes back with a `spec.md` written before any code.
