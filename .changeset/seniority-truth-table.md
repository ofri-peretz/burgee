---
"seniority": minor
"burgee": patch
---

The precedence order is now exported as a truth table. `TRUTH_TABLE` has 32 rows, one for each combination of the five sources (flag, env, config, package, default). Each row lists the sources that set a value and names the one that wins. It is `truthTable(ORDER)`, so it always matches the order `resolve` uses, and the new docs page [The truth table](https://seniority.interlace.tools/docs/guides/truth-table) is generated from it.

Provenance through `extends` now names the right file. When a config extends another, a value set only by the parent used to be credited to the extending file, which does not contain it. The loaded layer now has `origins`: for each key, the nearest file in the chain that set it, and that file's line. `resolve`, `explain` and `--json` provenance cite that file and line. A file that extends nothing loads the same as before.

burgee: `--explain` and `meta.provenance` now give the line for a value set in a config file (`app.config.json:3`). They also name the file in an `extends` chain that set it, not the whole chain joined into one location.
