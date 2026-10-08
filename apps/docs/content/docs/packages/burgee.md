---
title: burgee
description: "An agent-native CLI framework, drop-in compatible with commander and yargs. One declaration; help, --json, --schema, --mcp and completions all projected from it."
---

A **burgee** is the small swallowtail flag a boat flies to say which club or fleet it
belongs to — a flag of identity, not of instruction. That is what this framework does for
a command-line program: a command declares itself once, and every surface is that
declaration read by a different reader.

It replaces **commander** and **yargs**: `burgee/commander` and `burgee/yargs` are drop-in,
graded by each one's own test suite. Change one import and the same program answers agents
too — `--json` for results, `--schema` for the command tree, `--mcp` for an MCP server.

## Install

```bash
npm install burgee
pnpm add burgee
yarn add burgee
bun add burgee
```

## Quick start

```js
// cli.mjs — the whole CLI
import { defineCommand, run } from 'burgee';

run(defineCommand({
  name: 'greet',
  description: 'Greet someone by name',
  options: { name: { type: 'string', required: true, description: 'who to greet' } },
  effects: 'read_only', // what running it does to the world; required, and what --mcp reads
  run: ({ options }) => ({ greeting: `hello, ${options.name}` }),
}));
```

```console
$ node cli.mjs --name ada
greeting: hello, ada

$ node cli.mjs --json --name ada
{"ok":true,"data":{"greeting":"hello, ada"},"meta":{"provenance":{"name":{"source":"flag","location":"--name"}}}}

$ node cli.mjs            # exit 2
error: missing required option --name
hint: pass --name <value>
usage: greet [options]
options:
  --name <value>  who to greet (required)
```

One file. No build step, no config file, no directory convention. A test enforces
that on every commit.

## One declaration, every surface

```text
defineCommand()  ──▶  manifest  ──┬──▶  human help
                                  ├──▶  --json      one stable envelope
                                  ├──▶  --schema    versioned, one document per surface
                                  ├──▶  --mcp       an MCP server, generated
                                  ├──▶  completions bash · zsh · fish · pwsh
                                  ├──▶  TypeScript types
                                  └──▶  docs + llms.txt
```

Nothing here needs keeping in sync, because nothing is written twice.

## What is in the box

| Import | Gives you |
| :-- | :-- |
| `burgee` | `defineCommand()`, `run()`, the exit-code contract and the JSON envelope. |
| `burgee/commander` | The commander API, graded by commander's suite. |
| `burgee/testing` | Run a command in-process and assert on its result — no spawning. |
| `burgee/brand` | One brand declaration → flag, favicon, OG card, cover, lockup. The logo above is its own output. |
| `burgee/plugin` | `definePlugin()`, `validate()`, `CONTRACT` and `PluginError` — the host, at the subpath every package in the family publishes its host at. |

## Writing a plugin

A plugin is one module whose default export is a plain object. In full, with a command and a
hook:

```js
// acme-plugin.mjs
export default {
  name: 'acme',
  contract: 1, // required on a plain object; `definePlugin` from `burgee/plugin` stamps it for you
  commands: [
    { path: ['audit'], description: 'Audit the tree', options: {}, effects: 'read_only', run: () => ({ findings: 0 }) },
  ],
  hooks: {
    // One hook per stage: parse, preRun, postRun, onError, shutdown. `filter.command` is a
    // RegExp tested against the command's path, words joined by spaces (`deploy prod`);
    // leave `filter` out and the hook fires for every command.
    preRun: { filter: { command: /^publish/ }, handler: (ctx) => {} },
  },
};
```

A plugin's command is read by exactly the code a first-party one is read by, so the same
refusals apply: reserved option names, duplicate flags, a contributed path that is already
declared — and `effects`, which every runnable command declares: `read_only`, `idempotent`,
`non_idempotent` or `withheld`. An object that reaches `use()` without a `contract` is refused
rather than accepted on trust, because burgee's extension point shipped before it validated
anything.

Check it before it ships. `--json` returns the report as a document, and the exit code is the
verdict:

```bash
npx burgee check ./acme-plugin.mjs --json
# in a clone of this repository, where dist/ is not committed: build burgee and the five
# packages it imports, then run the built bin
npx turbo run build --filter=burgee
node packages/burgee/dist/cli.js check ./acme-plugin.mjs --json
```

```json
{"ok":true,"data":{"name":"acme","commands":[{"path":"audit","description":"Audit the tree","effects":"read_only"}],"hooks":[{"stage":"preRun","applies":"commands matching /^publish/"}]},"meta":{"provenance":{}}}
```

`data.name` is the plugin, `data.commands` one row per contributed command, and `data.hooks`
one row per hook with its `stage`. A refusal exits 1 and carries `data.refused` instead —
`{ code, message, fix }`, where `fix` is the edit to make. `ok` agrees with the exit code, so
it is `false` here, and `data.refused.fix` says what to change:

```json
{"ok":false,"data":{"refused":{"code":"E_PLUGIN_CONTRACT","message":"plugin \"acme\" declares no contract; …","fix":"add `contract: 1` — `definePlugin` from `burgee/plugin` stamps it"},"exitCode":1},"meta":{"provenance":{}}}
```

## Migrating

Already on commander or yargs? Change one import:

```diff
- import { Command } from 'commander';
+ import { Command } from 'burgee/commander';
```

```diff
- import yargs from 'yargs';
+ import yargs from 'burgee/yargs';
```

Your code and your tests are unchanged.

Or let the codemod make that change, and the same one for chalk, ora, string-width,
cross-spawn, signal-exit and every other incumbent the family replaces at full grade:

```bash
npx burgee migrate --dry-run
npx burgee migrate
```

It rewrites import specifiers and nothing else, leaves a replacement that is not level yet
alone with its grade, refuses a file it cannot rewrite whole, and prints the install command
to run next — [Migrate](https://burgee.interlace.tools/docs/migrate).

## Compatibility

Drop-in compatible with both incumbents, graded by **their own test suites** — 1,360 / 1,360
of commander's tests and 816 / 816 of yargs' on the
[compatibility page](https://burgee.interlace.tools/docs/compatibility) — with the pass rate
published and ratcheting. A façade is never called "compatible" until its host's own suite
passes 100%; below that the rate is published instead of claimed.

## Benchmarks

Every number here is produced by `npm run bench` and published at [burgee.interlace.tools/docs/benchmarks](https://burgee.interlace.tools/docs/benchmarks).

Graded by the incumbent's own test suite:

| suite | passing |
| :-- | --: |
| `commander` | 1360 / 1360 |
| `meow` | 146 / 148 |
| `yargs` | 816 / 816 |

## For agents

Every command answers the same declaration four more ways, with nothing written by hand:

- `--json` — one stable envelope, `{ ok, data, meta }`, with the provenance of every option.
- `--schema` — the whole command tree as data, versioned, one document per surface.
- `--mcp` — the same manifest served as MCP tools over stdio; each tool's `effects` becomes its
  MCP hints, and `withheld` keeps a command out of the list.
- **Exit `2`** when the *command* was wrong, with a `hint:` — so an agent rewrites the command
  rather than retrying it.
- **A failure names the next step.** A `fix:` when there is exactly one (the flag or command it
  was nearest to), otherwise the failing command's usage line and options, or, for an unknown
  command, the commands that exist. It is prose on stderr, and `error.usage` in the `--json`
  envelope.
- `--explain <option>` — where a value came from: flag, env, config or default. Every
  command's help lists it, and the root help ends with one line for agents.
- **A plugin can be checked before it ships.** `npx burgee check ./plugin.mjs --json` returns
  `{ name, commands, hooks }` as `data`, or `data.refused` with a `fix` and exit 1 — the whole
  plugin and both documents are under [Writing a plugin](#writing-a-plugin).

[Your CLI is an agent tool](https://burgee.interlace.tools/docs/agent-surfaces) has each
surface; the docs themselves are at
[burgee.interlace.tools/llms.txt](https://burgee.interlace.tools/llms.txt) and
[llms-full.txt](https://burgee.interlace.tools/llms-full.txt).

## Status

`burgee` is published and working: the engine, the exit-code contract, the JSON envelope,
help from the manifest, plugins with hook filters, and a `burgee/commander` façade that
runs a real commander program. The dev loop, prompts, lazy commands and groups are not
here yet.

Roadmap, architecture and the 114-requirement floor:
<https://github.com/ofri-peretz/burgee>

## FAQ

### Is burgee a commander alternative?

Yes — and a yargs alternative. It is drop-in compatible with both: change
`import { Command } from 'commander'` to `import { Command } from 'burgee/commander'` (or
`yargs` to `burgee/yargs`) and your code and tests are unchanged. Compatibility is graded by
each host's own test suite in CI, not asserted. Side by side:
[burgee vs commander](https://burgee.interlace.tools/docs/vs/commander) and
[burgee vs yargs](https://burgee.interlace.tools/docs/vs/yargs).

### How do I make my CLI usable by an AI agent?

Declare it with `defineCommand()` — or keep it on commander or yargs syntax through the
drop-in front ends. Every command then answers `--json` with one stable envelope,
`--schema` with the whole command tree as data, and exits `2` when the *command* was wrong
so an agent knows to rewrite it rather than retry. None of it is written by hand; it is
the declaration read by a different reader.
[Your CLI is an agent tool](https://burgee.interlace.tools/docs/agent-surfaces) has each surface.

### How do I expose a CLI over MCP?

Run it with `--mcp`: the same manifest is served as MCP tools over stdio. Every runnable
command declares its `effects` — `read_only`, `idempotent` or `non_idempotent`, which become
MCP's hints, or `withheld`, which keeps it out of the tool list — so nothing reaches an
agent by accident. On `burgee/commander` and `burgee/yargs`, a command that declared
nothing is still listed, marked `effects: 'undeclared'`. Register it with any stdio client:

```json
{ "mcpServers": { "mytool": { "command": "npx", "args": ["mytool", "--mcp"] } } }
```

### Does it have dependencies?

None outside the burgee family. `burgee` installs five packages from that family —
`bellpull`, `closeout`, `linegauge`, `roundel` and `seniority` — and each of those takes
nothing from outside it either: one repository, one release pipeline, one supply chain to
audit.

## API

The entry points are under [What is in the box](#what-is-in-the-box); the reference, with every
option and type, is at [burgee.interlace.tools](https://burgee.interlace.tools/docs/packages/burgee).

## Where it sits

Plugins register under the `commands` and `hooks` keys, against the one schema the whole family shares.

Nothing in this family builds on it yet, and it builds on `bellpull`, `closeout`, `linegauge`, `roundel`, `seniority`.

## The family

Ten packages, one repository, one release pipeline. A CLI on burgee declares what it is, roundel
carries its colours, flagstaff flies it and caique answers back; each installs on its own, and none
takes a dependency from outside the family.

| Package | What it is | Replaces |
| :-- | :-- | :-- |
| **burgee** (this package) | The CLI framework: one declaration, every surface | commander and yargs |
| [roundel](https://roundel.interlace.tools/docs) | Colour: one output policy, semantic tokens, a theme | chalk |
| [flagstaff](https://flagstaff.interlace.tools/docs) | The frame loop: spinners, progress, boxes and tables | ora, log-update, boxen and cli-table3 |
| [caique](https://caique.interlace.tools/docs) | Prompts that are flags first, and never hang | inquirer and clack |
| [linegauge](https://linegauge.interlace.tools/docs) | Measuring, wrapping, truncating and slicing styled text | string-width, wrap-ansi, strip-ansi and slice-ansi |
| [paratext](https://paratext.interlace.tools/docs) | Hyperlinks, images, title, clipboard and notifications | ansi-escapes, terminal-link and term-img |
| [seniority](https://seniority.interlace.tools/docs) | Configuration precedence and discovery, with provenance | cosmiconfig, dotenv and rc |
| [closeout](https://closeout.interlace.tools/docs) | Exit handlers, terminal restore and a bounded shutdown | signal-exit, exit-hook and restore-cursor |
| [bellpull](https://bellpull.interlace.tools/docs) | Subprocesses, and which executable actually ran | cross-spawn and which |
| [controlroom](https://burgee.interlace.tools/docs/packages/controlroom) | Full-screen, keyboard-driven terminal screens | ink, graded by ink's own suite |

Every migration guide, and the family-wide [compatibility](https://burgee.interlace.tools/docs/compatibility)
and [benchmarks](https://burgee.interlace.tools/docs/benchmarks) pages, are on
[burgee.interlace.tools](https://burgee.interlace.tools/docs/packages).

## Contributing

Issues and pull requests are welcome at [ofri-peretz/burgee](https://github.com/ofri-peretz/burgee/issues); read
[CONTRIBUTING.md](https://github.com/ofri-peretz/burgee/blob/main/CONTRIBUTING.md) first. Report a vulnerability privately, as
[SECURITY.md](https://github.com/ofri-peretz/burgee/blob/main/SECURITY.md) describes — never in a public issue.

## Licence

MIT © Ofri Peretz — see [LICENSE](https://github.com/ofri-peretz/burgee/blob/main/packages/burgee/LICENSE).
