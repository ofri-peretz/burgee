---
id: B-20261011-inquirer-prompts-tarball-room
section: B
status: open
source: inquirer-prompts-drop-in R3, R4, R5
recommendation: 'raise caique''s artifact band once, to the measured size with all ten prompts (about 83,000 gzipped and 297,000 unpacked), as product and not drift, the way D-152 raised it for caique/clack; then land the nine held prompts, R4''s rewrite and R5''s weight row'
---

`caique/inquirer` carries `select` and `usePagination` of `@inquirer/prompts`. The other nine
prompts (`checkbox`, `input`, `confirm`, `password`, `number`, `expand`, `rawlist`, `search`,
`editor`) are written and were graded by the stopped run, and they are held out of the package
because they do not fit caique's tarball ratchet: `check:artifacts` allows 10% over
`.sdlc/bands/artifact-size-baseline.json`, which #1022 lowered to 68,179 B gzipped and
232,356 B unpacked when it stopped shipping unreachable declaration files, so the ceilings are
74,996 and 255,591. Raising that band is a decision, not a build step.

Measured 2026-10-11 with `npm pack --dry-run`, on main after #1022 and with the compiled test
fixture no longer shipped:

| caique | gzipped | unpacked |
| :-- | --: | --: |
| main | 68,179 | 232,356 |
| with `select` (this change) | 73,605 | 250,623 |
| with `select` and `checkbox` | 75,746 | 260,478 |
| with all ten prompts | about 82,960 | about 296,750 |
| ceiling | 74,996 | 255,591 |

What each held module costs the tarball: `inquirer-checkbox` 2,141 / 9,855;
`inquirer-input` (input, confirm, password, number) 2,599 / 14,027; `inquirer-keyed` (expand,
rawlist) 1,600 / 8,757; `inquirer-search` 1,166 / 6,506; `inquirer-editor` 1,412 / 5,381, and
it adds `bellpull` as a dependency. Together about 8,900 B gzipped and 44,500 B unpacked.

No room is left to find inside the rules: comments are already stripped from the JavaScript,
`strip-comments.mjs` forbids minification by design, declarations keep their doc comments, and
#1022 has already taken the unreachable ones. The nine are kept outside this change, on the
owner's machine (branch `wip/inquirer-prompts-all-ten`), ready to land when the band moves.

Until this is decided, `@inquirer/prompts`' row is below level, so `burgee migrate` does not
rewrite that package (R4), and `caique/inquirer` is not weighed against `@inquirer/prompts` in
`subpath-weight-lock.test.ts` (R5): one prompt of ten against the whole of the incumbent would
be a flattering comparison.
