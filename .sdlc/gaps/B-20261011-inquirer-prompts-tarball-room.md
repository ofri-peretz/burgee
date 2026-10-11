---
id: B-20261011-inquirer-prompts-tarball-room
section: B
status: open
source: inquirer-prompts-drop-in R3, R4, R5
recommendation: 'raise caique''s artifact band once, to the measured size with all ten prompts (about 83,000 gzipped and 297,000 unpacked), as product and not drift, the way D-152 raised it for caique/clack; then land the eight held prompts, R4''s rewrite and R5''s weight row'
---

`caique/inquirer` carries `select`, `checkbox` and `usePagination` of `@inquirer/prompts`. The
other eight prompts (`input`, `confirm`, `password`, `number`, `expand`, `rawlist`, `search`,
`editor`) are written and were graded by the stopped run, and they are held out of the package
because they do not fit caique's tarball ratchet (`check:artifacts`, 10% over
`.sdlc/bands/artifact-size-baseline.json`'s 70,917 B gzipped and 240,290 B unpacked, so ceilings
of 78,008 and 264,319). Raising that band is a decision, not a build step.

Measured 2026-10-11, `npm pack --dry-run`, after this branch stopped shipping
`dist/__fixtures__/` and the six declaration files no `exports` entry reaches:

| caique | gzipped | unpacked |
| :-- | --: | --: |
| main | 72,434 | 245,044 |
| with `select` and `checkbox` (this change) | 75,740 | 260,476 |
| with all ten prompts | 82,960 | 296,753 |
| ceiling | 78,008 | 264,319 |

What each held module costs the tarball: `inquirer-input` (input, confirm, password, number)
2,599 / 14,027; `inquirer-keyed` (expand, rawlist) 1,600 / 8,757; `inquirer-search` 1,166 /
6,506; `inquirer-editor` 1,412 / 5,381, and it adds `bellpull` as a dependency. Together
6,777 B gzipped and 34,671 B unpacked, about 4,952 and 32,434 over the ceilings.

No room is left to find inside the rules: comments are already stripped from the JavaScript,
`strip-comments.mjs` forbids minification by design, and declarations keep their doc comments.
The eight are kept outside this change, on the owner's machine (branch
`wip/inquirer-prompts-all-ten`), ready to land when the band moves.

Until this is decided, `@inquirer/prompts`' row is below level, so `burgee migrate` does not
rewrite that package (R4), and `caique/inquirer` is not weighed against `@inquirer/prompts` in
`subpath-weight-lock.test.ts` (R5): two of ten prompts against the whole of the incumbent would
be a flattering comparison.
