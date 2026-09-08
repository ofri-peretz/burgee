---
"burgee": minor
---

`burgee/yargs` and `burgee/yargs/helpers`: yargs 18 ported method for method — with its whole dependency tree (yargs-parser 22, cliui 9 with string-width and wrap-ansi, y18n 5 and the 29 locales, escalade, get-caller-file) reimplemented over no dependency — and graded by yargs' own suite: **782 / 804** on the first run, one short of the 783 the real package scores in the same environment. The one test left asserts that `Parser` is the same object as the `yargs-parser` npm package, which a dependency-free port cannot be. `import yargs from 'burgee/yargs'` and `import { hideBin, applyExtends, Parser } from 'burgee/yargs/helpers'` are the drop-in; `examples/conformance` proves the demo byte-identical on both.
