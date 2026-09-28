---
"burgee": patch
"flagstaff": patch
---

Three defects carried over from the incumbents, and three places where a port answered differently from the incumbent on a bad value.

- `burgee/yargs/parser`: with `unknown-options-as-args`, every `-`-prefixed argument ran through five flag regexes, and two of them backtracked — one quadratically, one cubically (a 4,000-character argument took ten seconds). They are linear scans now, and give the same answer as the regexes for every input, checked against them over every short string of the characters involved. yargs' own suite still passes 804 of 804.
- `burgee/yargs/parser`: `{ "a": null }` in one config and `a.b` from a default or a second config threw "Cannot read properties of null". A `null` parent is now an absent one, as the parser's own key lookup already treated it.
- `burgee/yargs`: `showHelp()` with an async default-command builder that rejected left an unhandled rejection that ended the process. The rejection now goes to `fail`, where yargs sends a command handler's rejection, so a `.fail()` handler receives it.
- `burgee/meow`: `importMeta: null` throws meow's own "The `importMeta` option is required" TypeError instead of a null dereference, and `input: null` or an array is refused as meow refuses it.
- `flagstaff/cli-table3`: a style name that cannot be read off a colour function (`caller`, `arguments`) draws the cell plain, as cli-table3 does, instead of throwing out of `toString()`.
