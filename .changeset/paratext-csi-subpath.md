---
"paratext": patch
"flagstaff": patch
"caique": patch
---

`paratext/csi`: the CSI half of `ansi-escapes` as a subpath of its own — cursor moves, erases, scrolling, the alternate screen and synchronized output, byte-exact with `ansi-escapes` 7.3.0. It is 2,700 bytes and, unlike the package root, registers no built-ins when imported.

`flagstaff/log-update`, `flagstaff/ora`, `caique/raw` and `caique/inquirer` take their cursor sequences from it instead of carrying their own copies; caique now depends on paratext. Output is unchanged, with one spelling difference: `caique/raw`'s repaint clears with `ESC[J` rather than the equivalent `ESC[0J`. `caique/inquirer` keeps `@inquirer/ansi`'s answer of nothing for a zero-row move, where `ansi-escapes`' `cursorUp(0)` is `ESC[0A`.
