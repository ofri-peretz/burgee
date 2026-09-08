---
"burgee": minor
---

`burgee/yargs/parser`: the ported yargs-parser as its own entry — what `import parser from 'yargs-parser'` gave, for a program that imported the parser directly. With it, and with the compatibility harness able to `require()` its vendored root as a package, both façades now pass **100%** of their hosts' own suites: `burgee/commander` 1,361 / 1,361 and `burgee/yargs` 804 / 804.
