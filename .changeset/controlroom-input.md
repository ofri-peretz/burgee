---
"controlroom": minor
"closeout": minor
---

controlroom hosts an input line inside a screen (R20): `open(rt, { input: { editor, pane, onSubmit } })` routes keys to caique's line editor while its pane has focus and lets unused keys fall through to the keymap; outside a terminal, entries come from piped stdin, never a wait. closeout gains `bracketedPaste()` in `closeout/cursor`, paired with its restore like the alternate screen.
