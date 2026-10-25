---
id: D-20261025-roundel-tarball-colorette
subject: "roundel's tarball baseline: raise it for `roundel/colorette`, or trim?"
taken: 'Raised, 36,074 -> 39,354 B gzipped and 106,490 -> 121,201 B unpacked: nothing in the pack is a fixture, map or vendored file, and the growth is two drop-ins each graded level with its incumbent (2026-10-25)'
date: '2026-10-25'
superseded_by: —
---

**What tripped.** `npm run check:artifacts` on #1233: `roundel: unpacked grew 13.8% (106490 ->
121186 bytes)`, past the 10% allowance. The baseline was recorded at `af243288` (#1186), before
either colour facade of `colour-facades` existed.

**What grew, from `npm pack --dry-run` in `packages/roundel`.** 34 files, every one `dist/*.js`,
`dist/*.d.ts`, `dist/schema.json`, `README.md`, `package.json` and the licence; no `__fixtures__`,
no source map, no test, no vendored file (`files` already excludes `*.map` and `*.test.*`). Of the
14,711 unpacked bytes:

- **yoctocolors, #1218** — `dist/yoctocolors.js` 3,188 and its `.d.ts` 2,873, plus its README
  sections. It landed at about 7% and inside the allowance, so it never asked.
- **colorette, this pull request** — `dist/colorette.js` 2,630 and its `.d.ts` 2,288, 1,939 B of
  README (the drop-in block, the compatibility paragraph, the badge and the table row) and 220 B of
  `package.json` (the export, `typesVersions`, the keyword).

**Why raise rather than trim.** Each subpath is what a program migrating off a 52.9M- or
34.5M-a-week package installs, graded level by that package's own suite (67 / 67 and 78 / 78), and
each bundles under its incumbent (2,425 B against colorette's 2,602; 3,275 against yoctocolors'
3,395) — the bar a consumer's bundle pays, which `scripts/subpath-weight-lock.test.ts` holds. A
subpath a program does not import costs it nothing at run time (`sideEffects` and per-subpath
`exports`); the tarball is the one place every subpath is paid for, once, on install. The only
trims on offer were the README sections, which are the drop-in's documentation and are projected
into roundel's docs site, and collapsing `Colorette`'s 41 named members in the declaration, which
would save under a kilobyte and make the type less readable than colorette's own. Neither is worth
the value it removes.

**The new figure is the measurement**, so the next facade (kleur) asks again rather than riding
inside room left here.
