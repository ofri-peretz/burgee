---
id: B-20261012-fix-lines-quote-for-posix-only
section: B
status: closed
source: agent-skill R3 review (#1043)
recommendation: 'decide which shell a `fix:` line is written for (POSIX and PowerShell, or cmd.exe too), then quote for it in `shellWord` once, for every caller'
---

A `fix:` line promises a command that runs as written. `shellWord` (`unknown-option.ts`) quotes a
word that needs it with single quotes, and every `fix:` line goes through it: the unknown-option
and unknown-command refusals (`unknown-option.ts`, `surfaces.ts`) and `burgee skill --check`
(`skill-files.ts`). Single quotes work in POSIX shells and PowerShell, but not in cmd.exe, so on
Windows a path with `\` or `~` (`C:\Users\RUNNER~1\…`, as CI's temp directory is) is quoted in a
form cmd.exe does not read. Which shell the line targets is a decision about the `fix:` contract
for the whole family, so it is recorded here and not settled inside one command.

**Closed 2026-10-19 (#1139, fix-lines-every-shell).** `shellWord` quotes for the platform's
default shell (D-20261012-fix-lines-shell-target): POSIX off Windows, PowerShell on it. A Windows
refusal's fix line runs in `pwsh` and hands the program the words it meant, on `completions.yml`
and every Windows cell of `compat.yml`. One word does not carry, `--%`:
[B-20261019-fix-lines-stop-parsing-word](./B-20261019-fix-lines-stop-parsing-word.md).
