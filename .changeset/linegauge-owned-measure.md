---
"burgee": patch
"caique": patch
---

Measuring text against a terminal is linegauge's job, and four places did it by hand.

- `caique/raw`: the repaint counted a frame's rows with `split('\n')` and ignored wrapping, so a choice whose hint was wider than the terminal left a stale copy of the question on screen after every keypress. It counts rows with linegauge's `lineCount` against the terminal's width, which `Writer` now carries as an optional `columns` (read through to the output stream by `createIo`). A writer without one is treated as never wrapping, as before.
- `burgee/testing`: `stripAnsi` is linegauge's `strip`. The regex it used left private modes (`ESC[?25l`), the colon form of a truecolor SGR (`ESC[38:2::255:0:0m`) and OSC 8 hyperlinks in the text.
- `burgee` help: descriptions and epilogues are folded by `linegauge/wrap` rather than a loop of help's own. A styled description now opens and closes its styles on each row instead of running its colour into the next row's indent, and a run of spaces at a break no longer leaves trailing whitespace. Lines the author indented are still kept verbatim, and a word wider than the row still overflows rather than breaking.
- `burgee` `config explain`: the option column is padded in terminal columns, so a CJK option name no longer pushes its value two columns right of the others.
