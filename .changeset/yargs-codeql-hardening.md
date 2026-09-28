---
"burgee": patch
---

`burgee/yargs`: four defects carried over from yargs 18.1.0, fixed without changing an answer yargs' own suite checks (804 of 804).

- Parsing a command string is linear. Upstream's parse-command regexes backtracked quadratically on a long run of whitespace or dots (20,000 took 0.7 s); the rewrite gives the same result for every input, checked against the original regexes over every short string of the characters involved.
- `extends` in a config tells a path from a module name in linear time, for the same reason.
- `pkgConf(key)` reads only a key the package.json has. `pkgConf('__proto__')` used to hand `Object.prototype` to the `extends` loader, which deletes `extends` from the object it is given.
- zsh completions escape `\` as well as `:`. zsh's `_describe` strips one level of backslashes, so a command, option or choice containing one completed without it.
