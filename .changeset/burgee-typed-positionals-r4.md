---
'burgee': minor
---

A typed positional is published as its type, and its `choices` are offered on TAB
(typed-positionals R4).

- `--schema` and `--mcp`'s `inputSchema` give an argument its JSON type: `integer`, `number`,
  `boolean`, or `string` for `string` and `file`. Before this, every argument was `string`. A
  declared `default` is published as that type (`0.5`, not `"0.5"`).
- Shell completions offer a positional's `choices` in its slot, in bash, zsh, fish and PowerShell,
  for native programs and for `burgee/commander`'s `Argument.choices()`. They are read from the
  script, so TAB still never runs the program for them. A command whose other positionals declare
  a completer gets them from `__complete`.
