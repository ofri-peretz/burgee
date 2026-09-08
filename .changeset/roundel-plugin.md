---
'roundel': minor
---

Add `roundel/plugin`: a plugin ships a theme, and roundel reads it.

`tokens` has been in the plugin schema all along, described as "a roundel theme", with
nothing to read it — a plugin that shipped one was validated and then ignored. `register()`
now collects them, `theme()` hands the result to `fly()`, and `contributions()` reports
which plugin won each token and which it shadowed.

The same plugin object works on any subset of the family: keys roundel does not understand —
`glyphs`, `spinners`, `components` — are ignored, not refused. A misspelt token name *is*
refused, naming the ten valid ones, because a silently dropped `errror` looks like it worked.

Registering does not fly the theme; the program still calls `fly()` once, and a plugin token
below 4.5:1 throws there exactly as a hand-written one does. Nothing is imported from
flagstaff — the plugin shape is declared structurally, so no package in the family requires
another. The subpath reaches no module at all: 2,812 B, most of it refusal messages.
