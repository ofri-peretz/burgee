---
'roundel': minor
---

`roundel/import`: `fromBase16(scheme)` and `fromITerm(plist)` read a Base16 scheme (its YAML or JSON text, or the object a reader made of it) or an iTerm2 `.itermcolors` file into the theme `fly()` takes.

`error`, `warn`, `ok`, `flag` and `value` take the ANSI hue each one's default names, and `ground` the background; the mapping is exported as `BASE16_SLOTS` and `ITERM_SLOTS`. The theme is checked by `audit()` before it is returned, so a scheme that does not read on its own background is refused with an `ImportError` naming the slot, and whatever an importer returns, `fly()` accepts. Every refusal carries a `code` (`E_IMPORT_FORMAT`, `E_IMPORT_SLOT`, `E_IMPORT_CONTRAST`) and a `fix`. No network and no bundled corpus: the file is yours to supply. Its own subpath, not re-exported from `roundel`.

`roundel/chalk` is now graded by chalk 6.0.1's own suite: 59 / 59, level with chalk itself.
