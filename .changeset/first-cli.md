---
"burgee": minor
---

`npx burgee init [dir]` starts a CLI in one command: it writes the README quick start as `cli.mjs`
and a `package.json` that runs it (`type: module`, a `bin`, `burgee` at the running version), and
nothing else. It refuses to overwrite either file without `--force` (exit 2, with the `fix:` line),
and `--install` runs the install with the package manager it ran under. The quick start now opens
with `#!/usr/bin/env node`, so the file runs as the `bin` it is named by.
