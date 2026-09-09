<p align="center">
  <a href="https://github.com/ofri-peretz/burgee" target="blank">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ofri-peretz/burgee/main/brand-assets/burgee-lockup.svg" />
      <img src="https://raw.githubusercontent.com/ofri-peretz/burgee/main/brand-assets/burgee-lockup-light.svg" alt="burgee" width="360" />
    </picture>
  </a>
</p>

<p align="center">
  Everything a CLI needs that isn't your CLI. Written once, served to humans and agents alike.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/burgee"><img src="https://img.shields.io/npm/v/burgee?style=flat-square&color=0a6b47" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/burgee"><img src="https://img.shields.io/npm/dm/burgee?style=flat-square" alt="npm downloads" /></a>
  <img src="https://img.shields.io/badge/runtime%20dependencies-0-0a6b47?style=flat-square" alt="Zero runtime dependencies" />
  <img src="https://img.shields.io/badge/Node.js-24+-green.svg?style=flat-square" alt="Node.js 24+" />
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License: MIT" />
</p>

A **burgee** is the small swallowtail flag a boat flies to say which club or fleet it
belongs to — a flag of identity, not of instruction. That is what this framework does for
a command-line program: a command declares itself once, and every surface is that
declaration read by a different reader.

## Start here

```bash
npm install burgee
```

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

## One declaration, every surface

```text
defineCommand()  ──▶  manifest  ──┬──▶  human help
                                  ├──▶  --json      one stable envelope
                                  ├──▶  --schema    versioned, JSON-Schema validated
                                  ├──▶  --mcp       an MCP server, generated
                                  ├──▶  completions bash · zsh · fish · pwsh
                                  ├──▶  TypeScript types
                                  └──▶  docs + llms.txt
```

Nothing here needs keeping in sync, because nothing is written twice.

## Already on commander?

Drop-in compatible with both incumbents, graded by **their own test suites** — 1,215
commander tests and 1,185 yargs tests — with the pass rate published and ratcheting:

```diff
- import { Command } from 'commander';
+ import { Command } from 'burgee/commander';
```

Your code and your tests are unchanged. A façade is never called "compatible" until its
host's own suite passes 100%; below that the rate is published instead of claimed.

## What is in the box

| Import | Gives you |
| :-- | :-- |
| `burgee` | `defineCommand()`, `run()`, the exit-code contract and the JSON envelope. |
| `burgee/commander` | The commander API, graded by commander's suite. |
| `burgee/testing` | Run a command in-process and assert on its result — no spawning. |
| `burgee/brand` | One brand declaration → flag, favicon, OG card, cover, lockup. The logo above is its own output. |

## Status

`burgee` is published and working: the engine, the exit-code contract, the JSON envelope,
help from the manifest, plugins with hook filters, and a `burgee/commander` façade that
runs a real commander program. The dev loop, prompts, lazy commands and groups are not
here yet.

Roadmap, architecture and the 101-requirement floor:
<https://github.com/ofri-peretz/burgee>

---

Part of the [burgee](https://github.com/ofri-peretz/burgee) family: a CLI on burgee declares
what it is, [roundel](https://www.npmjs.com/package/roundel) carries its colours,
[flagstaff](https://www.npmjs.com/package/flagstaff) flies it, and
[caique](https://www.npmjs.com/package/caique) answers back. Each is an independent package;
none requires the others.

MIT © Ofri Peretz — see [LICENSE](./LICENSE).
