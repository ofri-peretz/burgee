---
"paratext": minor
---

`paratext/term-img` — the `term-img` surface as a drop-in subpath.

`terminalImage(image, options?)` and `UnsupportedTerminalError`, graded at **12 / 18**
against term-img's own suite, up from 0. A subpath rather than the package root because the
root default export is already `ansi-escapes`' object and term-img's default export is a
function — one default cannot be both, which is why the row measured zero: its whole TAP was
a `SyntaxError` about a missing named export, not eighteen failing behaviours.

The six cases that stay red are one decision. `term-img` accepts a **path** and reads it;
this package takes bytes only, so that `node:fs` stays out of a package that otherwise
touches nothing but strings. The refusal is a `TypeError` thrown at exactly the point
upstream would have opened the file, which is what keeps the four path-to-an-unsupported-
terminal cases passing. `terminalImage(await readFile(path))` is the migration.

The five-terminal support table is term-img's own — iTerm2 ≥ 3, WezTerm ≥ 20220319,
Konsole ≥ 22.04, Rio ≥ 0.1.13, VSCode ≥ 1.80 — read from the environment, with no
`iterm2-version` and no `ansi-escapes` behind it, and with upstream's iTerm2 major-version
comparison corrected so that 10.x is not read as 1.x.

The OSC 1337 record moved from `builtins.ts` into its own module so the new subpath can
reach it without loading the plugin registry. `paratext`'s exported `image` capability is
the same object it always was.
