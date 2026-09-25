---
"burgee": minor
---

`--format=agent` prints a command's result the way an agent wants to read it: one compact logfmt line per record — `key=value` pairs, nested keys dotted, lists of scalars comma-joined, a value quoted only when it holds a space, `=`, `"` or `,` — with no envelope, no `meta`, no summary and whitespace collapsed. A list result is one line per element; a scalar is itself. It is not JSON on purpose (oxlint's and vitest's agent reporters converged on the same shape), and it is smaller than `--json` on the same result: 31% over a representative set, from 20% on a twelve-row list to 96% on a bare count. `--json` wins when both are typed, so the envelope and D-140's failure contract are unchanged; a failure without `--json` is still prose on stderr; the exit code is the one the result names. A command that declares its own `format` option keeps the flag. The formatter loads only when the flag is typed.
