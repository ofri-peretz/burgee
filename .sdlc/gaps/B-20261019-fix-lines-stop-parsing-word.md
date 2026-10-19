---
id: B-20261019-fix-lines-stop-parsing-word
section: B
status: open
source: fix-lines-every-shell R3, PR #1139 (completions.yml run 39218012729)
recommendation: 'find a PowerShell spelling that hands a native command the literal word `--%`, and prove it in the R3 run; until then a `fix:` line carrying that word does not run as written in PowerShell'
---

A `fix:` line on Windows quotes the word `--%` as `'--%'` (fix-lines-every-shell R1), so the
tokenizer does not read it as the stop-parsing token. That is not enough. R3 ran
`& node echo.mjs … 'a,b' '--%' '~' '$HOME' … 'a b' plain` in `pwsh` on CI's Ubuntu runner, and
the program received `[…, "a,b", "~", "$HOME", …, "a", "b", "plain"]`. The `--%` argument was
dropped, and every argument after it was passed as raw text and split on spaces. The quoting
reached PowerShell intact, so this is PowerShell's native-argument binder acting on the
argument's value, not on how it was typed. No single-quote spelling carries the word through.

**Who it hurts.** Only a program whose fix line corrects a command that carries the literal
argument `--%`. That is rare, but the `fix` contract promises a line that runs as written.

**Held now.** `shellWord('--%', 'win32')` still quotes the word (R1). The R3 run leaves it out
of the words it checks and names this gap beside the exclusion.
