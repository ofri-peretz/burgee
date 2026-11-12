---
"seniority": patch
---

Six fixes.

- **`seniority/rc` keeps `NAME_a=1` whatever order the environment lists `NAME_a__b` in.** The `__` nesting walk replaced a value with an object to nest into, so `{ NAME_a: '1', NAME_a__b: '2' }` gave `{ a: { b: '2' } }` and the reverse order gave `{ a: '1' }`. rc's walk stops at a value that is not an object, and drops the deeper key: both orders now give `{ a: '1' }`.
- **`seniority/rc` returns objects and arrays of its own.** The merge stored a nested object or array from `defaults` or `argv` by reference, so `rc(name, defaults).a.b = 2` changed the caller's `defaults`. It now copies them, as `deep-extend` does; a `Date` or class instance is still carried whole.
- **`seniority/rc` skips `/etc` on Windows by default, as rc does.** `win` defaulted to `false` everywhere, so Windows read `/etc/<name>/config` and `/etc/<name>rc`. It now defaults to whether the platform is `win32`; passing `win` still decides.
- **`seniority/yaml` reads an indentation indicator at the top level as js-yaml does.** `|2` on a document's own block scalar counted from column 0 rather than YAML's -1, so `|2\n   x` read `' x\n'` where js-yaml reads `'  x\n'` (and `|1\n x` lost its space). A block scalar under a key or a sequence item was already right.
- **`seniority/yaml` reads an indented `%` line as a directive, as js-yaml does.** A document of one indented line, a space then `%x`, was refused as stray content and `%YAML 1.2\n %x\n---\na` as a bad document; the first is now js-yaml's `directives end mark is expected` and the second reads `'a'`.
- **`seniority/yaml` reports an unclosed multi-line quoted scalar at the end of the input as js-yaml does.** `k: "unterminated\n` was `unexpected end of the stream within a double quoted scalar`; it is now js-yaml's `deficient indentation (2:1)`.
