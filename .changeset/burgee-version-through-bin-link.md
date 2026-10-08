---
"burgee": patch
---
`--version` reports the CLI's own version when it runs through the bin link npm installs. It looked up the owning `package.json` from the link's directory, so `node_modules/.bin/burgee --version` printed the installing project's version and `npx burgee --version` printed "no version declared". The same applied to every CLI built with `defineProgram` that takes its version from `package.json`.
