---
id: D-20261124-help-default-once
subject: 'A default a description already names prints once, a plain runtime error may carry its own fix, and the stderr error line stays'
taken: 'Taken — on the owner''s delegation of budgets (2026-10-12): trim first, then raise by the measurement rounded up to 50 B'
date: '2026-11-24'
superseded_by: —
---

**Help and a failure's `options:` rows leave out `(default: <value>)` when the description
already names its default in a parenthesis: `(default: …)`, `(default origin/main)`,
`(defaults to …)` or `(the default)`, in any case. Any thrown value that falls through to
`RUNTIME` now keeps the `hint` and `fix` it carries, so D-20260930-failures-teach-recovery's rule
"not when there is a `fix`" applies to it too. The `{"error":…}` line on a piped stderr is
unchanged.** `--schema` still publishes every default as its value.

## Why

- **The default printed twice wherever a CLI both described it and declared it.** triggerlist
  declares `--repo` with `default: '.'` and the words `(default: the current directory)`, so help
  printed `the repository to read (default: the current directory) (default: .)`; truepass's
  `diff --base` printed `(default origin/main) (default: origin/main)`. The words win because
  they say what the value means. The fix is in the framework, `defaultNote` in `help.ts` and
  `SAYS_DEFAULT` in `usage.ts`, so no CLI has to remember it. `help-annotations.test.ts` and
  `failure-teaches.test.ts` hold both renderers. A description that says "defaults to" outside a
  parenthesis still gets the note, because only the parenthesis reads as the note itself.
- **A runtime error could not say what to run.** `classify` carried `hint` and `fix` only from a
  class that claims a code: `UsageError`, `AuthError`, `ConfigError`, a `defineError` class, or a
  refusal named by string. `RUNTIME` is the one code no class can claim (`defineError` takes 7 to
  125, and `NAMED` leaves `RUNTIME` out because it is the default, not a claim). A handler that
  knew the one line to run next therefore printed the usage block under it, and replz worked
  around it with a class of its own carrying `Symbol.for('burgee.exitCode')`. Now
  `Object.assign(new Error(message), { fix })` is enough, and the exit code is still 1. A thrown
  value with neither field teaches exactly as before (`teaches as before when a runtime failure
  carries nothing, whatever was thrown`).
- **The JSON line on stderr is not a bug.** clispec-conformance R6 specifies it: under `--json`,
  stdout has the envelope and stderr exactly one `{"error":{"kind","code","message"}}` line;
  without `--json`, the same line follows the prose when stderr is not a terminal, and at a
  terminal nothing is added. Seen through a pipe, as an agent's shell sees it, that reads as a
  JSON line in text mode, and under `--json` as the envelope printed twice. It is the structured
  error clispec's "Structured errors" and cli-agent-lint's SD-1 read from stderr alone, and
  `json-failure.test.ts` holds it.

## Bytes (`dist/`, the weight lock's walk)

| entry / file | before | after | Δ |
| :-- | --: | --: | --: |
| `./help` | 9,633 | 9,710 | +77 (ceiling 9,650 → **9,750**) |
| `help.js` | 9,160 | 9,237 | +77 |
| `usage.js` (lazy) | 3,598 | 3,689 | +91 |
| `failure.js` (lazy) | 6,555 | 6,582 | +27 |

Trimmed first: the pattern sits inside `defaultNote` rather than in a named constant beside it,
which took the door from 9,761 to 9,710. `usage.js` keeps its own copy of the pattern, because
importing it from `help.js` would put help on the failure path.
