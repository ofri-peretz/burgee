---
"caique": minor
---

`caique/editor`: the line editor as a component a host drives (`editor()` returns `initial`, an `onKey` reducer and `render`), with multi-line entry, history, bracketed paste treated as text, and a completion menu the program feeds. Its commands are a `caique/keys` keymap (`EDITOR_KEYS`). Off a terminal, `submissions(stdin)` yields one entry per line and ends when the input does. The editing itself moved into a module `caique/clack`'s prompts share, so there is one line editor in the package.
