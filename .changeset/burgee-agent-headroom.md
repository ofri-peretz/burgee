---
"burgee": minor
---

Output formats are data on the plugin object, and `--max-bytes` budgets any machine format
(`agent-headroom` RF and R3).

- A plugin's `formats` maps a name to `{ render(value), description }`. `--format=<name>` picks
  one, and `--format` with no name lists every format, built-ins included. burgee registers its
  own `agent` and the new `tsv` the same way: a header row, then one tab-separated line per row
  of a list result, 59% smaller than minified JSON on fifty rows of four fields. `--schema`'s
  `output.formats` names the same set, and `burgee check` checks a plugin's formats. A format
  renders a success's data only. A failure is written as it always was, `hint` and `fix`
  included.
- `--max-bytes <n>` cuts a list result at the last whole row that fits, so the document still
  parses, and says so: `truncated: { of, returned }` in the `--json` envelope, or one
  `{"truncated":…}` line on stderr for a line format. A result that is not a list is returned
  whole with `over`, the bytes it is over the budget. Without a machine format it is refused
  before the handler runs.
