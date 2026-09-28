---
"caique": minor
"burgee": patch
"compat-oracle": patch
---

`caique/clack` now carries `@clack/prompts`' prompts, not only `limitOptions`: `text`, `password`, `confirm`, `multiline`, `date`, `path`, `select`, `selectKey`, `multiselect`, `groupMultiselect`, `autocomplete` and `autocompleteMultiselect`, with `intro`, `outro`, `cancel`, `note`, `log`, `stream`, `spinner`, `tasks`, `group`, the `S_*` glyphs, `settings`/`updateSettings` and `isCancel`, under clack's names and options. They run on caique's own keypress loop and reach nothing outside this repository. Graded by clack's own suite at 16 / 17 (was 14 / 17; the control is 17 / 17): the one case left imports `updateSettings` from `@clack/core`, which caique does not depend on (D-152). The spinner animates only on a terminal outside CI and prints each message once anywhere else. `box`, `progress` and `taskLog` are not built. `burgee migrate` reports the new grade and, since it is not level with the control, still does not rewrite `@clack/prompts`.
