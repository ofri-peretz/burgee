---
'burgee': minor
---

An error carries `fix` — the exact flag to run next — beside `hint`.

E3 asks for *"`code`, `message`, `hint`, and where possible `fix`: **the exact command or flag
to run next**"*. The envelope was `{code, message, hint}`, and `hint` is prose.

The distinction matters most for the caller this package exists for. **An agent can execute a
`fix`.** A `hint` it has to read, interpret and guess at — one more turn, and the turn where
it invents a flag that does not exist. Every *plugin* error in the family already carried
`fix`; the engine's own did not.

```
$ tool deploy --forc --json
{"ok":false,"error":{"code":2,"message":"unknown option --forc",
                     "hint":"did you mean --force?","fix":"--force"}}
```

`fix` is omitted, never guessed, when there is no near match: an executed guess burns the turn
the field exists to save.
