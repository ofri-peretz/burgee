---
id: D-20261012-fix-lines-shell-target
subject: 'Which shell is a `fix:` line written for? (B-20261012-fix-lines-quote-for-posix-only)'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets and trade-offs'
date: '2026-10-12'
superseded_by: —
---

**For the platform's default interactive shell: POSIX `sh` everywhere except Windows, and
PowerShell on Windows. cmd.exe is not a target.** `shellWord` quotes once, by `process.platform`,
for every caller (`unknown-option.ts`, `failure.ts`, `surfaces.ts`, `skill-files.ts`).

**Why.** Both families use single quotes, and they differ only in how a quote inside a quoted
word is written: `'\''` in POSIX, `''` in PowerShell. Today's POSIX form, pasted into
PowerShell, is a syntax error for any word containing `'`. PowerShell is the default shell of
Windows Terminal and of the GitHub Actions Windows runner, which is where agents on Windows run.
cmd.exe has no quoting that a single rule can produce for every word (`%` and `^` expand inside
double quotes), so promising it would be promising a line that does not run.

**Cost.** A branch on `process.platform` in one function; the envelope gains no key.

**Reversal.** A new decision adding a `shell` key to the envelope, or targeting cmd.exe.
