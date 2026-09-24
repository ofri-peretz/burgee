---
'burgee': minor
---

Options can compute their shell completions at TAB time. Give an option `complete: (partial) => string[]`, and the generated bash, zsh, fish and PowerShell scripts call the program back for that option only. Options without a completer still complete statically from `choices`, and the program never runs for them. The callback prints nothing and exits 0 if a completer fails, so TAB never shows an error.
