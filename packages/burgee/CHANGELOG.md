# burgee

## 0.2.0

### Minor Changes

- [#14](https://github.com/ofri-peretz/burgee/pull/14) [`95a954f`](https://github.com/ofri-peretz/burgee/commit/95a954f82f44ce1249fa1a051e529ad46b258376) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `burgee/yargs` and `burgee/yargs/helpers`: yargs 18 ported method for method — with its whole dependency tree (yargs-parser 22, cliui 9 with string-width and wrap-ansi, y18n 5 and the 29 locales, escalade, get-caller-file) reimplemented over no dependency — and graded by yargs' own suite: **782 / 804** on the first run, one short of the 783 the real package scores in the same environment. The one test left asserts that `Parser` is the same object as the `yargs-parser` npm package, which a dependency-free port cannot be. `import yargs from 'burgee/yargs'` and `import { hideBin, applyExtends, Parser } from 'burgee/yargs/helpers'` are the drop-in; `examples/conformance` proves the demo byte-identical on both.

### Patch Changes

- [#13](https://github.com/ofri-peretz/burgee/pull/13) [`21d0f4f`](https://github.com/ofri-peretz/burgee/commit/21d0f4f32722b19831fcfa3c7f4d73849eaeaed5) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `burgee/commander`: `parse()` is synchronous again and `parseAsync()` starts synchronously, exactly as commander's do. Since the `--schema`/`--mcp` surface landed, both went through an `async` surface check, so a synchronous action ran a microtask after `parse()` returned and a `preAction` hook after `parseAsync()` handed back its promise — commander's own suite asserts on both after every parse. 638 of its 1,331 tests had been failing on `main` while the Compatibility job reported success, because a `| tee` pipe hid the grader's exit code; every workflow step that pipes into `tee` now runs with `pipefail`.
