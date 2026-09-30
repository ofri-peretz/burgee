---
'paratext': minor
'burgee': patch
'compat-oracle': patch
---

`paratext/term-img` now takes a file path, as `term-img` does. `terminalImage('unicorn.jpg')` reads the file with `node:fs` and draws it, and a file `URL` works too. The read happens after the terminal check, so a path handed to a terminal that cannot draw it reaches your `fallback` (or `UnsupportedTerminalError`) without the file being opened. A missing file on a supported terminal throws `node:fs`'s `ENOENT`, as `term-img` does. The `Options` type is exported under term-img's name and is generic over what `fallback` returns, so a `fallback` that returns nothing type-checks.

`paratext/term-img` now grades 18 / 18 against term-img 7.1.0's own suite, level with term-img itself. It was 12 / 18: the six cases that pass a path were refused under D-030. This supersedes D-030 for this subpath only (D-20260930-paratext-term-img-path). It is the only paratext entry that imports `node:fs`. The root `image()` still takes bytes, and a lock fails if `node:fs` reaches the root or any other entry.

Because the row is level, `burgee migrate` now rewrites `term-img` to `paratext/term-img`.
