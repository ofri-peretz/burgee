---
"burgee": patch
---

A program on `burgee/yargs` now shows its `.conflicts()`, `.implies()` and `.example()` in `--schema` and in the `--mcp` tool list. Until now all three were dropped. `.conflicts()` appears as `exclusive` and `.implies()` as `dependsOn`, both under the option's canonical name, even when the program declared the relation on an alias or named an alias in it. `.example()` appears as `examples`, with `$0` spelt as the program name. A relation that names no option is left out: a positional count (`.implies('key', 1)`), a `--no-x` negation, or a dotted key. The commander front-end already projected its `.conflicts()`. yargs' own help and parsing are unchanged (816 / 816 on its suite). `burgee/yargs` bundles 428 B larger, at 108,773 B, which is still lighter than yargs' 111,686 B.
