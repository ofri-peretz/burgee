---
"compat-oracle": patch
---

string-width is re-vendored at 9.0.0, whose suite moved from ava to `node --test` and grew from 233 cases to 466. Its control is 9.0.0 itself, installed beside the suite (466 / 466), and the workspace root stays on string-width 8, which slice-ansi, wrap-ansi, cli-truncate, widest-line, boxen and ink still require.

string-width 8.3.0's suite stays graded as `string-width-8`, against `linegauge/v8` (233 / 233, control 233 / 233).
