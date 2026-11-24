---
"contractdiff": patch
"truemark": patch
"burgee": patch
---

`bin` paths are written the way `npm pkg fix` writes them (`dist/bin.js`, not `./dist/bin.js`), so `npm publish` no longer warns that it auto-corrected the manifest. `burgee init` scaffolds `"bin": { "<name>": "cli.mjs" }` for the same reason. Every family package's manifest follows, and a lock keeps the leading `./` out.
