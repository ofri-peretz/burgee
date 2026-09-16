---
'burgee': patch
---

`burgee` declares `sideEffects`, so a consumer's bundler may drop a module nothing imports.

Every module in the package is a declaration or a pure const except one, and that one is
named rather than the field being set to a flat `false`: `dist/cli.js` ends in `run(program)`,
because it is the package's own command line and executing on import is the whole point of it.
`sideEffects: ["./dist/cli.js"]` is therefore the accurate statement, where `false` would have
been a claim the package does not meet. `roundel` and `flagstaff` already carried the field;
`burgee` did not, which is the only reason this is a change rather than a fact.

Measured against the B4 fixtures, esbuild takes **9 bytes** off the core entry point
(56,868 → 56,859) and nothing off `burgee/commander` or `burgee/yargs` — esbuild's own
tree-shaking had already reached everything the field would have licensed it to drop. The
field is worth more to webpack and rollup, which consult it directly and are conservative
without it. No entry point changes shape, and every compat row is where it was: commander
1360 / 1360, yargs 804 / 804.
