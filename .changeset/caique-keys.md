---
"caique": minor
---

`caique/keys`: key presses decoded through `node:readline`'s keypress events into one `KeyPress` shape, keymaps as plain data (`match()`, `bindings()`), and `readKeys()`, which takes raw mode once through `closeout/cursor` and throws `E_NOT_A_TERMINAL` with a `fix` instead of waiting when stdin is not a terminal. `caique/raw`'s `keyOf` is rebuilt on the same decoder, and now reads the application-mode arrows (`ESC O A`) a terminal can send.
