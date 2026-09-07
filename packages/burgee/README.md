# burgee

**Not yet released.** This version reserves the name; the first working release is
wave 1 of the roadmap.

A **burgee** is the small swallowtail flag a boat flies to say which club or fleet it
belongs to — a flag of identity, not of instruction. That is what this framework does for
a command-line program: a command declares itself once, and every surface is that
declaration read by a different reader.

```
defineCommand()  ──▶  manifest  ──┬──▶  human help
                                  ├──▶  --json      one stable envelope
                                  ├──▶  --schema    versioned, JSON-Schema validated
                                  ├──▶  --mcp       an MCP server, generated
                                  ├──▶  completions bash · zsh · fish · pwsh
                                  ├──▶  TypeScript types
                                  └──▶  docs + llms.txt
```

Drop-in compatible with both incumbents, graded by **their own test suites** — 1,215
commander tests and 1,185 yargs tests — with the pass rate published and ratcheting:

```js
- import { Command } from 'commander';
+ import { Command } from 'burgee/commander';
```

It stays a library you import in one file: no build step, no config, no directory
convention, no scaffold. A test enforces that.

Roadmap, architecture and the 79-requirement floor:
<https://github.com/ofri-peretz/cli>

MIT © Interlace
