---
id: D-20261019-roundel-tarball-supports-color
subject: 'roundel''s tarball baseline, with roundel/supports-color in it'
taken: 'Raised to what is built: 41,319 B packed and 120,744 B unpacked, from 36,617 and 105,026 (2026-10-19)'
date: '2026-10-19'
superseded_by: —
---

**Raised.** `scripts/check-published-artifacts.ts` refused roundel at 13.2% packed and 15.4%
unpacked growth against `.sdlc/bands/artifact-size-baseline.json`. Most of that was already on
`main`: roundel built from `main` at `326907ec` packs to 39,448 B and 113,988 B unpacked, 7.7%
and 8.5% over a baseline last recorded before `roundel/picocolors` and its docs landed, inside the
10% allowance. This branch adds 1,871 B packed and 6,756 B unpacked on top of `main`:

- `dist/supports-color.js` 3,238 B and `dist/supports-color.d.ts` 1,273 B, the new subpath;
- the README's drop-in and compatibility paragraphs, 1,583 B;
- `package.json`'s export, `typesVersions` row and keyword, 260 B;
- `runtime.js` 7 B (`export` on `proc`).

**Trimmed first.** The comment on `proc` in `runtime.ts` was a doc comment, which `tsc` copies
into the published `runtime.d.ts`; it is a line comment now, 427 B unpacked off the measurement.
Nothing else in the list is removable without removing the subpath.

**Alternatives rejected.** Dropping the README paragraphs (the drop-in would be undocumented
where npm shows it) and moving `supports-color.d.ts`'s doc comments out (they are what a hover
shows, which `declaration-summaries` keeps on purpose).
