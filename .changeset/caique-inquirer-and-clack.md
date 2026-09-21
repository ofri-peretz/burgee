---
"caique": minor
---

`caique/inquirer` and `caique/clack` — two drop-in subpaths, and the first measured numbers
either incumbent has given caique.

`caique/inquirer` is `@inquirer/core`'s surface over `node:readline` and `node:async_hooks`:
`createPrompt`, `useState`, `useEffect`, `useMemo`, `useRef`, `useKeypress`, `usePrefix`,
`makeTheme`, `Separator`, the eight key predicates and the five error classes. Graded
**41 / 41, 100.0%** against `@inquirer/core` 12.0.3's own suite, up from 0 / 41 — a suite
that renders through a headless xterm and asserts the screen, so what passed is the prompt
loop rather than a drawing. `usePagination` is not implemented and is named as a gap in
`.sdlc/intents/caique/design.md` rather than shipped ungraded.

`caique/clack` is `limitOptions`, which is the part of `@clack/prompts` that is a rule
rather than a drawing. Graded **14 / 17, 82.4%**, up from 0 / 606 — and the denominator
moved for a reason published in full on the compatibility page: 289 of that suite's 444
assertions are `toMatchSnapshot()` across 17 of its 19 files, and those seventeen are
subtracted as a declared subset, one named entry each. The three that remain unpassed are
all of `guide.test.ts` and are a ceiling, not a shortfall: two want clack's twelve prompts
drawn frame for frame, and the third asserts we read `updateSettings` out of `@clack/core`'s
own module state, which a package with no external dependencies cannot see.

Both subpaths reach `linegauge/wrap`, and `caique/inquirer` also reaches
`closeout/exit-hook` — both published from this repository, both declared, both budgeted in
`weight.test.ts`. The package root is unchanged: nothing in either façade is reachable from
`caique` itself.
