---
"burgee": patch
---

`burgee/yargs` parses each usage string that `argsert` checks a builder call against once, not on every call. The B5 program, a 21-option `.option()` chain ending in `parseSync()`, ran parse-command 70 times per parse. On GitHub's x64 runners `burgee/yargs ÷ yargs` drops from 1.12–1.13 to 0.81–0.83. yargs' own suite still grades the façade 816 / 816, and yargs 17's suite 793 / 794, as before.
