# burgee

**Not yet released.** This version reserves the name; the first working release is
wave 1 of the roadmap.

A **burgee** is the small swallowtail flag a boat flies to say which club or fleet it
belongs to — a flag of identity, not of instruction. That is what this framework does for
a command-line program: a command declares itself once, and every surface is that
declaration read by a different reader.

```js
// cli.mjs — the whole CLI
import { defineCommand, run } from 'burgee';

run(defineCommand({
  name: 'greet',
  description: 'Greet someone by name',
  options: { name: { type: 'string', required: true, description: 'who to greet' } },
  run: ({ options }) => ({ greeting: `hello, ${options.name}` }),
}));
```

```console
$ node cli.mjs --name ada
greeting: hello, ada

$ node cli.mjs --json --name ada
{"ok":true,"data":{"greeting":"hello, ada"}}

$ node cli.mjs            # exit 2
error: missing required option --name
hint: pass --name <value>
```

One file. No build step, no config file, no directory convention. A test enforces
that on every commit.

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
