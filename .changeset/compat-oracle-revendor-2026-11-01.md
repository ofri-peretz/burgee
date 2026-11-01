---
"compat-oracle": patch
---

ora re-vendored at 10.0.0 (control 223 / 223), slice-ansi at 10.0.0 (control 106 / 106) and cli-truncate at 6.2.0 (control 17 / 17). slice-ansi and cli-truncate moved their suites from ava to `node --test`, and their rows follow. slice-ansi's pins move to what 10.0.0 resolves (`ansi-styles` 7.0.0, `string-width` 8.3.0) and add the `chalk` and `strip-ansi` its suite imports.
