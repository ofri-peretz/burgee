---
id: D-20260930-roundel-import-gallery
subject: 'roundel R11 — "the docs gallery is generated from them; hundreds of themes on day one": where the schemes come from'
taken: Owner
date: '2026-09-30'
superseded_by: —
---

**Default, until the owner says otherwise: the gallery is generated from the scheme files committed under `packages/roundel/src/__fixtures__/` — three on 2026-09-30 — and "hundreds on day one" is not met.** `scripts/roundel-gallery.ts` runs every `.yaml`, `.yml`, `.json` and `.itermcolors` file there through `fromBase16`/`fromITerm` and writes `apps/docs-roundel/content/docs/guides/theme-gallery.md`: one row per file, each colour with its ratio on the scheme's own ground, and a refused scheme listed as refused with the slot that refused it. `scripts/roundel-gallery.test.ts` fails when the page differs from a fresh render. Nothing in it is hand-written, which is the half of the sentence the package can keep alone. **Escalated because** "hundreds on day one" means committing the tinted-theming schemes and iTerm2-Color-Schemes corpora — several hundred third-party files, each under its own licence — into this repository and onto its public docs site. Redistribution is outward-facing, which `DECISIONS.md` sends to the owner. **What the owner is choosing between:** vendoring the corpora (licence review per file, a refresh flow like `compat-refresh.yml`); fetching them at docs build time (a network dependency in the docs build, none in the package); or the default, a gallery that grows a file at a time. The package itself is unaffected by the answer: R11 says no bundled corpus, and none ships.
