---
id: D-20261012-default-command-shape
subject: 'How does a native program declare the command that runs when argv names none?'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets and trade-offs'
date: '2026-10-12'
superseded_by: —
---

**`default: true` on one child command, at most one per level, refused at definition time when
two siblings claim it.** It is commander's `isDefault` under the manifest's own vocabulary, and
yargs' `$0` / `*` without a magic name. A word that is not a command name and not a flag goes to
the default command as a positional only when the default declares positionals; otherwise it is
still the unknown-command refusal it is today, with its `did you mean`.

**Why not a root handler.** A root `run` cannot carry its own options, examples and output
declaration apart from the program's global ones, and yargs #1331's 16 comments are about
exactly that: the default command's help showing its usage and examples.

**What is projected.** `--schema` says `default: true` on the command; help lists it with
`(default)`; completions offer the default's options at the root; `--mcp` exposes it as the tool
it already is.

**Reversal.** Remove the key; it is additive and no existing program sets it.
