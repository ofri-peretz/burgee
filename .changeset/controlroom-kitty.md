---
"controlroom": minor
"paratext": minor
"compat-oracle": patch
---

`controlroom/ink` negotiates the kitty keyboard protocol as ink does: pushed at once with `kittyKeyboard: { mode: 'enabled' }`, and in `auto` mode only once a known terminal answers the query, with every other byte handed back to stdin and the pop written at unmount. ink's own suite now passes 584 / 584. paratext's `csi` spells the protocol's three sequences (`kittyKeyboardPush`, `kittyKeyboardPop`, `kittyKeyboardQuery`).
