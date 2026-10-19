---
"burgee": patch
---

A `fix:` line is quoted for the shell that will run it: POSIX `sh` off Windows, as before, and
PowerShell on Windows, where a quote inside a word is doubled (`'it''s'`) and a word that starts
with `@`, contains `,` or is `--%` is quoted too. A fix line printed on Windows used to be a
PowerShell syntax error for any word with a `'` in it.

Root help's `Exit codes:` section, `--schema`'s `errors` and the skill's contract table now list
only the codes the program can produce. `auth` is listed when the program declares the credential
it reads, `defineProgram({ auth: { env: 'DEMO_TOKEN' } })`, and its advice then names the variable:
`set DEMO_TOKEN and run it again`. That sentence is also an `AuthError`'s hint when the handler
gives none. `timeout` is left out when every command declares its own `timeout` option.
