---
id: D-20261019-exit-codes-producible-auth-declared
subject: 'Which exit codes does a program''s contract list, and how does burgee know a program can exit `auth`? (agent-lint-conformance R8)'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets and trade-offs'
date: '2026-10-19'
superseded_by: —
---

**A program's exit-code contract lists the codes it can produce, and `auth` is one only when the
program declares it: `defineProgram({ auth: { env: 'DEMO_TOKEN' } })`.** Root help's
`Exit codes:` rows, `--schema`'s `errors` and the skill's contract table all read one list,
`producibleExits(manifest)` in `root-help.ts`, so they cannot disagree.

**Why.** Every code but two is produced by the engine for any program: `USAGE` by parsing,
`CONFIG` by config and plugin loading, `CANCELLED` by an `action_required` result, `SIGINT` by the
teardown. `TIMEOUT` is the engine's own `--timeout`, which steps aside for a command that declares
its own `timeout` option, so it is listed while some runnable command leaves the global in place.
`AUTH` comes only from a handler's `AuthError` (or a façade mapping one), and nothing in the
manifest predicted it, so every program printed `auth: … log in and run it again`. That one row
made cli-agent-lint 0.3.5's FS-4 fail every reading since 2026-10-11: help that mentions `auth`
with no env var or token flag reads as an auth program with no non-interactive path. A declaration
is the only evidence-based answer: inferring auth from an option named `--token` decides by name
(the defect class `lint:name-inference` gates), and reading handler source for `throw new
AuthError` is defeated by a helper.

**What the declaration buys.** With `auth` declared, the row's advice names the variable,
`auth: a credential is missing or refused; set DEMO_TOKEN and run it again`, which is the recovery
an agent can perform without a person, where "log in" is the one it cannot. The same sentence is
an `AuthError`'s hint when the handler gives none. The variable is checked at `defineProgram`
(SCREAMING_SNAKE, non-empty), in `execute.ts` rather than `definition.ts`: every front-end loads
`definition.ts` and only a native program declares `auth`, so the façades pay nothing.

**Cost, measured on this branch against `main` at `b700f4dd`.** The `.` entry's static graph
+190 B (35,423 → 35,613 of 35,681), and +10 B on every entry that loads `manifest.ts` (the class
field). The core bundle (B4 `core-bundled-bytes`) went 24,281 → 24,265 B with fix-lines-every-shell in the same branch: `describeFailure` now takes the manifest, a shorter call than the object it built. No budget moved.

**Rejected.** Rewording the row to dodge FS-4's words (evasion: the program would still claim a
code it cannot produce). Dropping `AUTH` for every program (a program that does authenticate
would hide the code its scripts branch on). Inferring auth from names, or from handler source.

**Reversal.** A new decision that gives the manifest a different credential notion.
