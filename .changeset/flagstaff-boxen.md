---
'flagstaff': minor
---

Add `flagstaff/boxen`: boxen 8's API, graded **84 / 84 by boxen's own test suite**.

Every one of boxen's 84 cases is a snapshot of the exact characters the box comes out as, so
matching the drawing byte for byte *is* the compatibility claim rather than a way of
avoiding one — a user leaving boxen cares about one thing, whether the box still looks the
same.

`borderStyle` (all eight cli-boxes styles, a style object, or `none`), `borderColor`,
`backgroundColor`, `dimBorder`, `title`/`titleAlignment`, `textAlignment`, `padding`,
`margin`, `width`, `height`, `float`, `fullscreen`, and the `_borderStyles` re-export.

Eight dependencies folded in. boxen reaches `string-width`, `wrap-ansi`, `cli-boxes`,
`ansi-align`, `widest-line`, `camelcase`, `chalk` and `type-fest`; this reaches `width.js`
and `wrap.js` — both already shipped for `flagstaff/ora` and `flagstaff/log-update` — plus
`roundel/chalk`. **43.0 KB in two packages, against boxen 8.0.1's 151.4 KB in fourteen.**

It carries cli-boxes' table itself rather than reading the plugin registry: `_borderStyles`
is boxen's public surface, and a façade whose drawing changed when somebody registered a
plugin would be reinterpreting its host. Named borders through the registry stay
`flagstaff/box`'s job.
