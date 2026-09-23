---
"paratext": minor
"burgee": patch
---

paratext implements `ansi-escapes`' CSI half — `cursorTo`, `cursorMove`, `eraseLines`, `clearTerminal`, `enterAlternativeScreen`, `synchronizedOutput` and the rest, byte-exact with ansi-escapes 7.3.0 — so `import ansiEscapes from 'paratext'` is a full drop-in, graded 4 / 4 by ansi-escapes' own suite (it was 1 / 4 with CSI declared `undefined`). `burgee migrate` now rewrites `ansi-escapes` to `paratext`.
