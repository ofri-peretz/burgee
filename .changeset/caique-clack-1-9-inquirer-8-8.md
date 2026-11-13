---
"caique": minor
---

`caique/clack` follows `@clack/prompts` 1.9.0 (23 / 23, control 23 / 23). The spinner gains an accessible mode, turned on by `accessible: true`, by `updateSettings({ accessible: true })` or by `ACCESSIBLE` in the environment. In that mode it prints plain appended lines a screen reader can follow, with no glyph, guide bar or escape:

- the start;
- `still working: <message>` every 30 s;
- the ending, or `Done`, `Canceled` or the error message when the ending names none.

`caique/inquirer` follows `@inquirer/prompts` 8.8.0 (228 / 228) and `@inquirer/core` 12.1.0 (47 / 47):

- `number` calls `validate` with `undefined` when an optional prompt is left empty.
- `select` takes an index only from plain digits, so `2e1` is not choice 20.
- `rawlist` takes one only from digits with whitespace around them, so `2x` is refused.
- `makeTheme` keeps the default for a key set to `undefined`.
