---
"paratext": minor
---

`paratext/terminal-link` — the `terminal-link` surface as a drop-in subpath.

`terminalLink(text, url, options?)`, `terminalLink.stderr`, and `isSupported` on both,
graded at **8 / 10** against terminal-link's own suite, up from 0. A subpath rather than the
package root because the root default export is already `ansi-escapes`' object and
terminal-link's default export is a function — one default cannot be both.

`Runtime.isTTY` gains an optional `stderr`, since this façade's whole surface is a pair and
deciding both streams from one would answer the wrong question for half the API.
