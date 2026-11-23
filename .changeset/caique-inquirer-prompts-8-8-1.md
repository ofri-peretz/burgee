---
"caique": patch
"burgee": patch
---

`caique/inquirer/prompts` follows `@inquirer/prompts` 8.8.1 (290 / 290, level with the control):

- A refused answer stays in the line to edit, in `expand`, `rawlist` and `search` as in the line prompts. An arrow pick in `rawlist` and `search` lands in the line, so the next key edits it.
- Keys typed while an async `validate` runs are dropped (`input`, `number`, `password`, `search`).
- `number` takes plain decimals only: `0x10`, `0b11`, `0o7`, `Infinity` and `1e999` are refused.
- `confirm` matches whole keywords and the built-in `y`/`n` before prefixes, and its hint shows whole graphemes.
- `checkbox` shows the disabled error for a digit on a disabled choice, and its `a`/`i` shortcuts clear an error.
- A failed `search` empties its results, says `Search failed` when the error has no message, and searches again on the next key.
- `input` leaves a `g` or `y` pattern's `lastIndex` alone, and a Tab typed into an answer is drawn as a tab.

`burgee migrate` names 8.8.1 as the `@inquirer/prompts` release graded level.
