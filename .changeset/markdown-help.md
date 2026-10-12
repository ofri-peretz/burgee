---
"burgee": minor
---

Help renders as Markdown. `renderHelp(manifest, node, { format: 'markdown' })` from `burgee/help` returns a promise of the same help as Markdown: a heading for the command, its usage in a code block, each section (arguments, options, global options, commands, exit codes, environment) as a table, and each example as a fenced line. It is a second layout of the same section list `--help` draws, so the two cannot list different things. The Markdown layout loads only when asked for; terminal help is unchanged, byte for byte.
