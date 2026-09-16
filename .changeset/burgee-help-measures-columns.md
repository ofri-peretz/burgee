---
'burgee': patch
---

Help measured its columns with `String.length`, so a CJK or emoji command name mis-drew its own help screen.

`.length` is the count of UTF-16 code units, which equals the number of columns a terminal draws only for the Latin-1 subset. `部署` is two code units and four columns; `🚀` is two and two. `help.ts` used it in five places — sizing the shared term column, deciding which terms overflow it, padding after a term, and both width tests inside the word wrapper — so a program whose commands are not spelled in ASCII got a description column that did not line up and description text wider than the terminal it asked for.

`yargs/cliui.ts`, one directory over, has imported `width` from `linegauge` for exactly this job since it was ported, and its own comment records the reason: cliui's port carried its own `stringWidth`, the ITU T.416 sub-parameter form `ESC[38:2::255:0:0m` that chalk emits for truecolor left `:2::255:0:0m` behind, and a 13-column string measured 25. burgee already depended on `linegauge`. This file simply was not asking.

- **Every measurement of rendered text in `help.ts` is now `linegauge`'s `width`**, and the term column is `widest`, which is the function that exists so a caller does not spread a large array into `Math.max`. The wrapper carries a running column count rather than re-measuring the accumulated line per word, so a long paragraph stays linear.
- **For ASCII the two agree exactly**, which is why no graded screen moves: commander 1360 / 1360 and yargs 804 / 804 before and after, unchanged.
- **What is still not fixed, in any character set:** a single token longer than the row is not broken. `wrap('see https://…/no/spaces now', 20)` leaves the URL on one over-long row today, `linegauge`'s own `wrap` defaults to `hard: false` for the same reason, and hard-breaking would re-draw the graded screens that contain URLs. A test pins that as a known limit rather than leaving it to be re-found.

Help also has snapshots now (PLAN 2.5.1), which it had none of: five command shapes × the plan's three widths — 33 where the term column is clamped, 80 where the ordinary case wraps, 120 where alignment is what is on trial. A help screen is a drawing and a drawing is a contract, which is the call this repository already made for `boxen`; the renderer's by-construction fixes were each asserted once by a test that names the property it checks, and therefore could not see a change nobody was looking for.

The core entry is 52,683 → 52,893 bytes against an unchanged 53,300 budget, so nothing was ratcheted. `linegauge` joins `closeout` and `seniority/precedence` as a bare import core admits, on the same argument as both: measuring a line is linegauge's own job the way precedence is the parser's, and the alternative here was the second copy of a width function staying wrong.
