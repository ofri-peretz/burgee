---
"controlroom": patch
---

The root entry's doc comment, which TypeScript shows on hover and the API reference prints, no longer says the package is reserved and exports one constant. It names what the entry exports: `open()` and its runtime, the layout arithmetic, the tab, focus and collapse reducer with its hint line, and the compositor, with ink's API at `controlroom/ink` and plugins at `controlroom/plugin`. `status` is still `'reserved'`, kept so a program that read it still loads.
