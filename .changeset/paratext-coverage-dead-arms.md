---
"paratext": patch
---

Code paths no input could reach are removed; behaviour is unchanged. `paratext check` no longer carries a "(replaces …)" suffix it could never print, because it loads one plugin into an emptied registry. `paratext/terminal-link`'s detection no longer carries `has-flag`'s short and bare flag forms, since every flag it asks about is a long one, nor a "not a tty" answer inside its colour check, which it only reaches for a tty. The root entry no longer registers the built-ins a second time after `ansi-escapes.js` has already done it at load. Three fallbacks for a regex group or a `split` element that is always there are gone, and the schema walk reads a type's first letter with `charAt`, which gives the same answer.
