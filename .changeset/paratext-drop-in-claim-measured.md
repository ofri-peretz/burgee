---
'paratext': patch
---

Stop claiming a drop-in path in the npm description until one is graded.

The compat oracle now vendors `ansi-escapes`' own suite at 7.3.0 and grades it. The control
is 4 / 4; `paratext` scores **0 / 4**, and the reason is one line of TAP —
`SyntaxError: The requested module 'paratext' does not provide an export named 'default'`.
The ansi-escapes-compatible default export (design R8) is not built, so "Drop-in paths for
ansi-escapes, terminal-link and term-img" was a claim with a measured zero behind it. The
description now says what is true — the OSC half of those three packages is covered — and
defers the drop-in claim to the row that would prove it.

No runtime behaviour changes.
